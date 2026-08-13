---
name: ragdoll-destruction-combat
description: "Use this skill when building a physics-driven 2D side-scrolling shooter/platformer in Phaser 4 with Matter.js -- specifically for Intrusion 2 / Metal Slug / Contra-style action games where the world itself is a weapon: ragdoll deaths, destructible structures, throwable debris, explosions with radial force, procedural aim, and combat 'juice' (screen shake, hit-stop, knockback). Trigger this whenever the user mentions ragdoll physics, destructible environments, physics-based combat, explosion force, debris, ragdoll enemies, or references Intrusion 2, Metal Slug, Worms, or similar physics-sandbox action games. This skill assumes ../physics-matter/SKILL.md (Phaser's own Matter.js API reference) is already known -- read that one first if it hasn't been consulted this session, since this skill only covers composition patterns on top of that raw API, not the API itself."
---

# Ragdoll, Destruction & Physics-Combat Feel (Intrusion 2 pattern)

> This skill is a **pattern layer**, not an API reference. It assumes you already know Matter.js
> basics from Phaser's official `physics-matter` skill (bodies, constraints, composites, collision
> filtering, sleep). What's missing from that skill -- and what this one supplies -- is *how to
> compose those primitives* into the specific gameplay feel that made Intrusion 2 (2012, VapGames)
> stand out: a world where the player, the bullets, the scenery, and the corpses are all part of
> one physics simulation, and the moment-to-moment fun comes from throwing that world at itself.

**Ground truth about the reference game** (so the feel target stays accurate): Intrusion 2 simulates
almost everything with physics -- player movement, projectiles, tree branches, swinging bridges,
guard-tower supports, and enemy corpses. Ragdolls are *not* anatomically realistic; they're loose,
floppy, and cinematic on purpose. The environment is a toolbox: you throw crates, use enemy remains
as shields, and trigger chain-reaction explosions. The game was capped at 30fps specifically because
its physics budget was the priority over frame rate -- performance budgeting (Section 5) is not an
afterthought, it's core to hitting this genre's feel.

## 1. Ragdoll: swapping an animated character for a physics rag

The trick is a **state swap**, not a physics-only character. While alive, the character is a normal
animated sprite (or a kinematic Matter body with a locked upright angle). On death, you destroy that
single sprite and spawn a compound of independently-simulated parts pinned together loosely.

```js
// Build once, reuse via pooling (see Section 5)
function spawnRagdoll(scene, x, y, inheritedVelocity, texture) {
    const parts = {
        head:  scene.matter.add.sprite(x, y - 30, texture, 'head',  { chamfer: { radius: 6 } }),
        torso: scene.matter.add.sprite(x, y,      texture, 'torso'),
        armL:  scene.matter.add.sprite(x - 10, y - 10, texture, 'armL'),
        armR:  scene.matter.add.sprite(x + 10, y - 10, texture, 'armR'),
        legL:  scene.matter.add.sprite(x - 6,  y + 30, texture, 'legL'),
        legR:  scene.matter.add.sprite(x + 6,  y + 30, texture, 'legR'),
    };

    // Loose pin joints, not rigid welds. Low stiffness = floppy, cinematic motion.
    const pin = (a, b, ax, ay, bx, by) =>
        scene.matter.add.constraint(a, b, 4, 0.4, {
            pointA: { x: ax, y: ay }, pointB: { x: bx, y: by }, damping: 0.1
        });

    pin(parts.torso, parts.head, 0, -20, 0, 10);
    pin(parts.torso, parts.armL, -8, -10, 0, -8);
    pin(parts.torso, parts.armR,  8, -10, 0, -8);
    pin(parts.torso, parts.legL, -6,  20, 0, -12);
    pin(parts.torso, parts.legR,  6,  20, 0, -12);

    // Inherit the character's last velocity so the death reads as a continuation
    // of the hit, not a teleport-and-drop.
    Object.values(parts).forEach(p => {
        p.setVelocity(inheritedVelocity.x, inheritedVelocity.y);
        p.setFriction(0.4, 0.02, 0.6);
        p.setBounce(0.15);
    });

    return parts; // keep the group reference for pooling / cleanup
}
```

**Matter.js has no native angular limit on constraints.** Real skeletal ragdolls in engines like
Box2D use rotational limit joints; Matter doesn't expose that directly. Two practical workarounds:
- Accept the floppiness -- it matches the reference game's aesthetic exactly (see Steam reviews:
  "not realistic, but incredibly satisfying and cinematic").
- If you want tighter limbs, use very short/stiff constraints (`length` near 0, `stiffness` near 1)
  so parts barely separate from their pivot, trading range of motion for looking less "spaghetti."

Add one random torque or off-center impulse (`applyForceFrom`) at spawn time so no two deaths play
identically -- this single line does more for "no death looks the same" than anything else.

## 2. Destructible structures

Model a breakable structure as several bodies pinned together, where the pins are removed under
damage rather than by natural physics stress (Matter constraints don't self-break on load by
default -- you decide when to cut them).

```js
function buildGuardTower(scene, x, y) {
    const base = scene.matter.add.rectangle(x, y + 100, 40, 200, { isStatic: true, label: 'support' });
    const platform = scene.matter.add.rectangle(x, y, 120, 20, { isStatic: true, label: 'platform' });
    const support = scene.matter.add.constraint(base, platform, 0, 0.95); // rigid until cut

    return { base, platform, support, hp: 3 };
}

function damageTower(scene, tower, hitPoint) {
    tower.hp -= 1;
    if (tower.hp <= 0) {
        scene.matter.world.removeConstraint(tower.support);
        scene.matter.body.setStatic(tower.platform, false); // falls under gravity now
        scene.matter.body.setStatic(tower.base, false);
        tower.platform.applyForceFrom(hitPoint, { x: 0, y: 0.02 }); // sell the impact
    }
}
```

**Explosions (radial force)** -- Matter doesn't ship a circular-query helper, so approximate with a
bounding-box query then filter by real distance:

```js
function explodeAt(scene, cx, cy, radius, power) {
    const candidates = scene.matter.intersectRect(cx - radius, cy - radius, radius * 2, radius * 2);
    candidates.forEach(body => {
        const dx = body.position.x - cx, dy = body.position.y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist === 0 || dist > radius) return;
        const falloff = 1 - dist / radius; // linear falloff, cheap and reads fine
        const nx = dx / dist, ny = dy / dist;
        scene.matter.body.applyForce(body, {
            x: nx * power * falloff,
            y: ny * power * falloff - power * falloff * 0.3 // slight upward bias reads better
        });
    });
    scene.cameras.main.shake(180, 0.01 * power); // see Section 4
}
```

Chain reactions (gas canisters igniting each other) are just: on hit, call `explodeAt`, and let
canisters within the blast radius also be flagged to explode after a short delay -- the delay is
what sells it as a *chain* instead of a single simultaneous burst.

**Throw/grab as a weapon** -- generalize `mouseSpring`: on grab input, find the nearest dynamic body
under the crosshair (`intersectPoint`), attach a temporary constraint from the player to it, and on
release remove the constraint and apply an impulse along the aim vector. This is what lets a player
pick up a dead enemy or a crate and use it against the next threat.

## 3. Procedural aim (skip animation frames for this part)

Intrusion 2's mouse-aiming works because the upper body/gun rotates procedurally toward the cursor
independent of the walk/run animation -- you don't need a sprite sheet for every aim angle.

```js
update() {
    const angle = Phaser.Math.Angle.Between(this.gun.x, this.gun.y, this.pointer.worldX, this.pointer.worldY);
    this.gun.rotation = Phaser.Math.Angle.RotateTo(this.gun.rotation, angle, 0.3); // smoothed, not snapped
    this.torso.setFlipX(Math.abs(angle) > Math.PI / 2); // flip body when aiming behind
}
```

Layer recoil on top as a *tween*, not a physics impulse on the gun sprite itself (the gun is usually
a non-physics child object): kick `gun.x` back a few px and rotation slightly off-angle, tween back
over ~80ms. Cheap, reads as punchy, doesn't touch the simulation.

## 4. Combat feel ("juice") tied to physics events

These are what make hits feel heavy even though the underlying numbers are small:

- **Screen shake**: `scene.cameras.main.shake(duration, intensity)` on any impact above a damage
  threshold. Scale intensity with damage, not a flat value, or every hit feels the same.
- **Hit-stop**: briefly drop `scene.matter.world.engine.timing.timeScale` to ~0.05 for 2-4 frames on
  big hits (boss stagger, killing blow), then ramp back to 1. This single trick sells impact more
  than any particle effect.
- **Knockback**: `applyForce` along the hit normal, scaled by damage -- reuse the same falloff logic
  from `explodeAt` for splash weapons.
- **Read the collision pair for damage direction**: `sprite.setOnCollideWith(enemyBody, (body, pair) => {...})`
  from the official physics-matter skill gives you `pair` with contact normal -- use it instead of
  guessing knockback direction from velocity alone.

## 5. Performance budget (this is not optional for this genre)

Intrusion 2 ran physics on *everything* and paid for it with a 30fps cap by design. You have a
choice Flash-era Intrusion 2 didn't: keep 60fps by being selective about what gets a real body.

- **Two-tier debris**: gameplay-relevant objects (crates, structural pieces, ragdolls) get real
  Matter bodies. Purely decorative debris (sparks, small chips, smoke) should NOT be Matter bodies --
  fake it with simple velocity+gravity math on plain sprites, or better, push it through
  `SpriteGPULayer` (see the `v4-new-features` skill) for particle-scale counts with zero physics cost.
- **`enableSleeping: true`** in world config, always, for this genre. Settled debris piles should
  cost nothing once they stop moving.
- **Pool ragdolls and debris bodies.** Cap active count (e.g. 30-40 ragdoll groups, 60-80 loose
  debris bodies); when the cap is hit, `.destroy()` the oldest before spawning a new one. Debris
  piling up forever is also a documented complaint about the original game -- don't repeat it.
- **Cull off-screen physics.** Anything that falls below the level or drifts far off-camera should
  be destroyed, not simulated forever.
- **Reduce iteration counts for decorative-tier bodies is not directly supported per-body in Matter**
  -- the iteration settings (`positionIterations`/`velocityIterations`/`constraintIterations`) are
  world-global. If you need a "cheap" tier, that's the strongest argument for keeping it out of
  Matter entirely (see two-tier debris above) rather than trying to tune it per-object.

## 6. Suggested file split

Matches single-responsibility conventions well -- each of these is a small, independent module:

```
ragdoll.js        // spawnRagdoll, pool management, cleanup
destructible.js   // structure definitions, damage → constraint removal
explosion.js       // explodeAt, chain-reaction scheduling
combat-feel.js     // shake, hit-stop, knockback helpers
debris-lite.js     // non-physics decorative debris (fake gravity, no Matter body)
aim.js             // procedural aim + recoil tween
```

## Related skills

- `../physics-matter/SKILL.md` -- read first; this skill assumes its API surface (constraints,
  compound bodies, collision filtering, sleep, `applyForce`/`applyForceFrom`, `intersectRect`).
- `../particles/SKILL.md` and `../v4-new-features/SKILL.md` -- for `SpriteGPULayer`-backed visual
  debris/sparks that shouldn't be real physics bodies.
- `../cameras/SKILL.md` -- for the shake implementation referenced in Section 4.
- `../filters-and-postfx/SKILL.md` -- Bloom/Glow/Shadow filters for selling explosions visually
  once the physics and force application here are working.
