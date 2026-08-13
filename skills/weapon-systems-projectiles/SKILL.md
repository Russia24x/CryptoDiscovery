---
name: weapon-systems-projectiles
description: "Use this skill when designing weapons, guns, projectiles, ammo, reload mechanics, or weapon-switching for a physics-driven 2D action game in Phaser 4 (Intrusion 2 / Metal Slug / Contra-style run-and-gun). Trigger this whenever the user mentions weapons, guns, bullets, ammo, reload, recoil, weapon pickup, grenades, rockets, or splash damage. This is a design-pattern layer -- it assumes ../physics-matter/SKILL.md, ../physics-arcade/SKILL.md, ../groups-and-containers/SKILL.md, ../tweens/SKILL.md, and ../time-and-timers/SKILL.md are already known, and it reuses ../ragdoll-destruction-combat/SKILL.md directly for explosion force and hit-feel, and ../enemy-ai-boss-encounters/SKILL.md for what a projectile needs to hit. It does not re-explain those APIs."
---

# Weapon Systems & Projectiles (Intrusion 2 pattern)

> Reviewers of the reference game specifically call out that its weapons "feel similar" despite the
> variety on offer -- that's the one weakness worth deliberately avoiding here. Differentiation
> comes less from damage numbers and more from **how a projectile moves and what it's allowed to
> touch**. That question -- what can this bullet physically touch? -- is also where a real Phaser 4
> architecture constraint shows up, so it's the right place to start.

## 0. The constraint that shapes everything below

Arcade and Matter physics **can run in the same Scene**, but per Phaser's own docs: *"An Arcade
Physics sprite... cannot collide with a Matter Physics sprite. You cannot add the same Sprite to
both systems."* If your enemies, destructible structures, and ragdolls are Matter bodies (per
`ragdoll-destruction-combat` and `enemy-ai-boss-encounters`), an Arcade-physics bullet will fly
straight through them with zero collision -- silently, no error. To get both plugins available at
all, the scene physics config needs both keys present even if one is empty:

```js
physics: {
    default: 'matter',
    matter: { gravity: { y: 1 } },
    arcade: {}   // present so this.physics exists too, even though matter is default
}
```

Given that, **don't reach for Arcade bullet-groups by default in this project** -- they're the
official pattern for Arcade-only games, but here they'd need a manual per-frame check against
Matter bodies anyway, at which point Arcade bought you nothing. Use the three-tier model instead.

## 1. Three-tier projectile model

**Tier 1 -- Hitscan (instant hit, no traveling sprite).** For fast, direct-fire weapons where the
bullet is visually just a muzzle flash + tracer line. Resolve the hit immediately with the ray query
Matter already gives you:

```js
function fireHitscan(scene, origin, angle, range) {
    const end = {
        x: origin.x + Math.cos(angle) * range,
        y: origin.y + Math.sin(angle) * range
    };
    const hits = scene.matter.intersectRay(origin.x, origin.y, end.x, end.y);
    if (hits.length) applyDamage(hits[0].gameObject, weaponDamage);
    drawTracer(scene, origin, hits[0]?.position ?? end); // visual only, one frame or a fast fade tween
}
```

No physics body, no pool, no per-frame update -- cheapest tier, use it for the "basic gun."

**Tier 2 -- Lightweight kinematic (visible, dodgeable, but not a real physics body).** For anything
the reviews describe as a "slow-moving projectile that can (and must) be dodged" -- this is a plain
Sprite you move by hand in `update()`, with a manual overlap check against Matter targets on
arrival, not a Matter body itself:

```js
function updateProjectile(scene, proj, delta) {
    proj.x += Math.cos(proj.angle) * proj.speed * (delta / 1000);
    proj.y += Math.sin(proj.angle) * proj.speed * (delta / 1000);

    // Manual hit check against the Matter world -- this is the step Arcade-vs-Matter would skip silently
    const hit = scene.matter.intersectRect(proj.x - 4, proj.y - 4, 8, 8);
    if (hit.length) {
        applyDamage(hit[0].gameObject, proj.damage);
        killProjectile(scene, proj);
    }
}
```

Pool these with the official Group pooling (`groups-and-containers`) -- `get()`/`killAndHide()` work
fine here since pooling is a display-list concern, not a physics one; you don't need Arcade physics
enabled just to pool sprites.

**Tier 3 -- Real Matter body.** Only for projectiles that must *physically* participate in the
simulation: grenades that bounce off terrain and can be shot out of the air, rockets that get
deflected by an explosion, anything that should visibly rest on the ground before detonating.

```js
function fireGrenade(scene, x, y, velocity) {
    const grenade = scene.matter.add.sprite(x, y, 'grenade', null, { restitution: 0.4, friction: 0.6 });
    grenade.setVelocity(velocity.x, velocity.y);
    scene.time.delayedCall(2000, () => {
        explodeAt(scene, grenade.x, grenade.y, 120, 0.08); // reuse from ragdoll-destruction-combat
        grenade.destroy();
    });
}
```

This is the only tier that costs real Matter simulation per-projectile -- budget it like the debris
budget in `ragdoll-destruction-combat` Section 5 (cap concurrent grenades/rockets, not just debris).

## 2. Weapon feel differentiation

Pick at minimum three axes that differ per weapon, or they'll all feel the same regardless of tier:

| Axis | Cheap way to vary it |
|---|---|
| Fire rate | cooldown timer between `fire()` calls |
| Spread | randomize `angle` by ± a per-weapon cone before firing (0 for hitscan rifle, wide for shotgun) |
| Recoil | a *tween* kicking the gun sprite back a few px + a slight angle offset, ~80ms, yoyo -- not a physics impulse (the gun is a non-physics child, per `ragdoll-destruction-combat` Section 3) |
| Screen shake | scale `camera.shake()` intensity per weapon, reuse the helper from `ragdoll-destruction-combat` Section 4 |
| Projectile count | shotgun = N hitscan rays fired in one spread cone burst, not N separate weapon types |

A shotgun and a rifle can share the exact same `fireHitscan` function above and still feel
completely different from spread + fire-rate + recoil alone -- you don't need a new tier or a new
code path per weapon, just different numbers fed into the same three tiers.

## 3. Ammo, reload, and switching as a small FSM

Same shape as the enemy FSM from `enemy-ai-boss-encounters` -- states, not booleans scattered across
the weapon object:

```js
class WeaponState {
    constructor(scene, config) {
        this.scene = scene;
        this.config = config; // { ammo, maxAmmo, reloadTime, fireRate }
        this.state = 'ready';
        this.cooldown = 0;
    }

    tryFire() {
        if (this.state !== 'ready' || this.cooldown > 0) return false;
        if (this.config.ammo <= 0) { this.changeState('empty'); return false; }
        this.config.ammo--;
        this.cooldown = this.config.fireRate;
        this.scene.events.emit('ammo-changed', this.config.ammo, this.config.maxAmmo);
        return true;
    }

    changeState(next) {
        this.state = next;
        if (next === 'empty' || next === 'reloading') this.startReload();
    }

    startReload() {
        this.state = 'reloading';
        this.scene.time.delayedCall(this.config.reloadTime, () => {
            this.config.ammo = this.config.maxAmmo;
            this.state = 'ready';
            this.scene.events.emit('ammo-changed', this.config.ammo, this.config.maxAmmo);
        });
    }
}
```

Emitting `ammo-changed` and (on switching) `weapon-switched` here costs nothing now and is exactly
what the future UI/HUD skill will listen for -- build the events in even before the HUD exists, same
principle as the `checkpoint-set` event in the boss skill.

## 4. Pickups and switching

A weapon pickup is a Matter sensor (`isSensor: true`, so it doesn't physically block anything) that
grants a weapon on player overlap and destroys itself:

```js
pickup.setOnCollideWith(player, () => {
    player.weapons.push(new WeaponState(scene, weaponConfigs[pickup.weaponId]));
    scene.events.emit('weapon-switched', pickup.weaponId);
    pickup.destroy();
});
```

Dropped weapons from dead enemies can reuse this directly -- spawn the pickup sensor at the ragdoll's
final resting position after a short delay (let the ragdoll from `ragdoll-destruction-combat`
Section 1 finish settling first, or the pickup will spawn mid-tumble and look wrong).

## Related skills

- `../physics-matter/SKILL.md` -- `intersectRay`, `intersectRect`, sensors, `applyForce`.
- `../physics-arcade/SKILL.md` -- only relevant if you deliberately want an Arcade-only bullet layer
  that never needs to touch Matter bodies (e.g. bullets that only hit an Arcade-only player); read
  Section 0 before reaching for this.
- `../groups-and-containers/SKILL.md` -- pooling Tier 2 projectiles without needing Arcade physics.
- `../time-and-timers/SKILL.md` -- reload timers, grenade fuses, fire-rate cooldowns.
- `../tweens/SKILL.md` -- recoil kick.
- `../ragdoll-destruction-combat/SKILL.md` -- `explodeAt` reused directly for splash weapons; combat
  feel (shake/hit-stop/knockback) reused for all damage application.
- `../enemy-ai-boss-encounters/SKILL.md` -- what `applyDamage` ultimately feeds into (staggers, weak
  points, phase progress).
