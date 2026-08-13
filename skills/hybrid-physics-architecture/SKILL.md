---
name: hybrid-physics-architecture
description: "Use this skill for foundational physics architecture decisions in a physics-driven 2D action game in Phaser 4: choosing Arcade vs Matter.js per Game Object, running both in one Scene deliberately, collision category/group bitmask design, solver iteration and sleep tuning at scale, fixed timestep, or mitigating fast-body tunneling. Trigger on: physics architecture, Arcade vs Matter, hybrid physics, collision categories, fixed timestep, tunneling, sub-stepping, solver iterations, sleep tuning. Sits BELOW ../ragdoll-destruction-combat, ../enemy-ai-boss-encounters, ../weapon-systems-projectiles, ../level-design-pacing-checkpoints, and ../ui-hud-menu-system SKILL.md files -- it is the architectural layer those five already assume, not a sixth parallel gameplay skill. Read first on a new project; read to resolve Matter-vs-Arcade disputes on an existing one."
---

# Hybrid Physics Architecture: Arcade + Matter, Deliberately Combined

> Phaser ships two physics systems that are, by design, "entirely separate" -- an Arcade body and a
> Matter body cannot collide with each other, and you must pick one per Game Object. Most tutorials
> treat this as a reason to pick one system for the whole game. **The professional answer for this
> genre is the opposite: pick both, on purpose, and bridge them deliberately.** This skill is the
> reasoning for that choice and the concrete mechanics of making it work, including the parts of
> Matter.js that don't have a clean answer (Section 5) and shouldn't be papered over.

## 1. Why the player character should probably not be a full Matter rigid body

This is the single most consequential decision in the whole project, and it's easy to get backwards
by assuming "everything is physics" (true of the reference game's *world*) should extend to the
player controller too. It shouldn't, for a concrete reason: a rigid body's response to input is
mediated by mass, friction, and the solver -- you push it and the solver decides what happens next.
Precise platforming needs the opposite: the designer decides exactly what happens next, every frame,
regardless of mass or friction. This is why the industry-standard answer, in 2D and 3D alike, is a
**custom kinematic controller** for the player, and a full rigid body for everything the player
affects but doesn't directly pilot.

Concretely: give the player an **Arcade Physics body** (AABB, velocity-driven, no rotation-from-
collision-response, `body.setAllowGravity`, `body.setDrag`, all directly settable every frame) --
not a Matter body with `ignoreGravity`/locked angle tricks. Arcade's simplicity is the feature here,
not a limitation to work around.

```js
// Game/Scene config needs BOTH physics keys present, even though only one is "default" --
// otherwise the second plugin (this.physics or this.matter) simply won't exist on the scene.
physics: {
    default: 'matter',
    matter: { gravity: { y: 1 }, debug: false },
    arcade: {}   // empty is fine -- its presence is what matters
}
```

```js
this.player = this.physics.add.sprite(x, y, 'player'); // Arcade: tight, predictable
this.player.body.setAllowGravity(true);
this.player.body.setDragX(600);           // deceleration you control exactly, not friction-derived
this.player.body.setMaxVelocity(300, 800);
```

Everything else from the previous five skills -- ragdolls, destructible structures, debris, grenades,
enemies -- stays on Matter exactly as written. Nothing in those skills needs to change; this section
just makes explicit *why* their examples already lean on "kinematic body with locked angle" language
for characters rather than full ragdoll-style rigid bodies while alive.

## 2. Bridging the gap: the player still needs to feel the Matter world

Since Arcade and Matter won't collide natively, every interaction between the Arcade player and the
Matter world is a **manual query**, done once per frame, not a passive collision callback:

```js
update() {
    // Standing on a Matter platform/debris pile: query a thin strip under the player's feet.
    const groundHits = this.matter.intersectRect(
        this.player.x - 10, this.player.y + this.player.height / 2, 20, 4
    );
    this.player.body.setAllowGravity(groundHits.length === 0);

    // Pushing through a pile of Matter debris: query the player's own footprint and shove bodies aside.
    const overlapping = this.matter.intersectRect(
        this.player.x - 12, this.player.y - 12, 24, 24
    );
    overlapping.forEach(body => {
        const dx = body.position.x - this.player.x;
        this.matter.body.applyForce(body, { x: Math.sign(dx) * 0.01, y: 0 });
    });

    // Explosions affecting the player: same falloff math as explodeAt() in
    // ragdoll-destruction-combat, but written to Arcade's velocity, not Matter's applyForce.
}
```

This is more code than "just let them collide," but it's the same amount of code either way -- the
alternative (making the player a Matter body) pays for it in worse platforming feel instead, which
is the worse trade for a genre where movement precision matters every frame and explosions only
happen sometimes.

## 3. Designing the collision category scheme up front

Matter allows 32 collision categories, allocated via `nextCategory()`. Decide the whole scheme once,
as a constants module, before any gameplay code -- retrofitting categories after bodies already
exist is how filtering bugs happen:

```js
export const Categories = {}; // populate once in the first scene's create()
export function initCategories(matterWorld) {
    Categories.ENEMY       = matterWorld.nextCategory();
    Categories.DEBRIS      = matterWorld.nextCategory();
    Categories.STRUCTURE   = matterWorld.nextCategory();
    Categories.PROJECTILE  = matterWorld.nextCategory();
    Categories.SENSOR      = matterWorld.nextCategory();
}
```

**The non-obvious professional trick: use `group` (not `category`) to solve the "explosion popcorn"
problem.** When a destructible structure fractures into several overlapping debris pieces in the
same frame (`ragdoll-destruction-combat` Section 2), those pieces start inside each other and will
violently separate over the next few frames unless you stop them from colliding *with each other* --
while still colliding normally with everything else:

```js
const fractureGroup = this.matter.world.nextGroup(true); // true = non-colliding group
fragments.forEach(f => f.setCollisionGroup(fractureGroup));
```

`group` overrides `category`/`mask` entirely for pairs that share it, per Matter's own resolution
order -- this is a one-line fix for a visibly janky bug that's otherwise tempting to solve by fudging
restitution/friction values, which never fully works.

## 4. Solver iterations: the ragdoll-floppiness dial you already hit

`ragdoll-destruction-combat` Section 1 noted Matter has no native angular constraint limit, and that
floppiness is partly a stylistic given. The part not mentioned there: **`constraintIterations`**
(world config, default `2`) directly controls how "solid" pinned joints feel under load -- raising it
tightens ragdolls and pinned structures without changing a single constraint definition:

```js
this.matter.world.engine.constraintIterations = 4; // steadier ragdolls/pinned structures, more CPU
```

The trade-off is real: iteration count multiplies CPU cost across every constrained body in the
world. If a level has both a ragdoll-heavy fight and a large destructible set-piece active at once,
this is a global knob, not a per-body one -- budget it like the debris cap in
`ragdoll-destruction-combat` Section 5, and prefer *fewer, chunkier* debris pieces over *many, tiny*
ones so the iteration cost buys visible stability rather than being spent on parts too small to
notice individually.

## 5. Tunneling: the honest limitation, not a false fix

**Matter.js has no continuous collision detection.** This is a known, acknowledged limitation of the
library itself (per its maintainer), not a Phaser gap -- fast-moving or thin bodies can pass through
other bodies within a single step, and there is no config flag that makes this fully go away. Three
real mitigations, in order of preference:

1. **Don't give fast projectiles a Matter body at all.** This is exactly why
   `weapon-systems-projectiles` tiers hitscan and lightweight-kinematic projectiles *out* of Matter
   entirely -- a raycast or a manually-moved sprite with a per-frame `intersectRect` check cannot
   tunnel, because it was never relying on the solver to catch a fast-moving collision in the first
   place. Reserve real Matter bodies (Tier 3: grenades, rockets) for things slow enough that
   tunneling isn't a practical risk.
2. **Sub-step deliberately for the bodies that must stay in Matter and must be fast.** Call
   `this.matter.world.step(delta)` manually multiple times per frame with a smaller delta instead of
   once with the full frame delta -- this is the library-recommended workaround, not a hack:
   ```js
   const subSteps = 3;
   for (let i = 0; i < subSteps; i++) this.matter.world.step(delta / subSteps);
   ```
   Reserve this for a specific fast body/scene rather than globally -- it multiplies solver cost by
   `subSteps` for everything in the world, not just the fast body.
3. **Avoid thin or stacked-thin static geometry for anything a fast body must reliably hit.** A wall
   built from many 1-tile-wide static bodies is more tunneling-prone (and more prone to the
   `slop`-related micro-catching documented in Matter's own issue tracker) than one merged static
   body covering the same footprint. When converting a tilemap layer to physics, prefer merging
   contiguous collision tiles into fewer, larger bodies over one-body-per-tile.

## 6. Fixed timestep, when you actually need it

Phaser's default loop steps Matter with the real frame delta, which is fine for a single-player game
where "slightly different simulation on a slow frame" is invisible. It stops being fine the moment
you want deterministic replays, rollback netcode, or frame-perfect speedrun-style timing. If you need
that, use `set60Hz()`/`set30Hz()` (fixes the *target*, still variable-if-the-browser-is-slow) or take
full manual control with an accumulator:

```js
let accumulator = 0;
const FIXED_DT = 1000 / 60;

update(time, delta) {
    accumulator += delta;
    while (accumulator >= FIXED_DT) {
        this.matter.world.step(FIXED_DT);
        accumulator -= FIXED_DT;
    }
    // render/interpolate visuals using accumulator / FIXED_DT as the blend factor if you need
    // smoothness between fixed steps -- most 2D action games skip this and accept the snap.
}
```

Don't reach for this by default -- it's real added complexity, and most of this genre's games (the
reference game included) ship without it. Build it only if a specific requirement (netcode, replays,
competitive timing) actually demands determinism.

## 7. Sleep tuning at debris scale

`ragdoll-destruction-combat` Section 5 already recommends `enableSleeping: true` globally. At the
level of individual bodies, `setSleepThreshold(n)` (default `60`, in simulation steps of near-zero
velocity before sleeping) is the per-body lever: lower it for decorative debris so piles go inert
faster and stop costing CPU, and consider leaving it default (or higher) for anything the player is
expected to interact with again soon (a thrown crate that should still feel "live" for a moment after
landing).

## Related skills

- `../ragdoll-destruction-combat/SKILL.md`, `../enemy-ai-boss-encounters/SKILL.md`,
  `../weapon-systems-projectiles/SKILL.md`, `../level-design-pacing-checkpoints/SKILL.md`,
  `../ui-hud-menu-system/SKILL.md` -- all five assume the player-controller decision in Section 1 and
  the projectile-tiering decision in Section 5 made here; read this skill first on a new project.
- Official `physics-matter` and `physics-arcade` skills -- raw API for everything referenced above.
