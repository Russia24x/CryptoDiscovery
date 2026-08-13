---
name: enemy-ai-boss-encounters
description: "Use this skill when designing enemy behavior, patrol/aggro/attack AI, or multi-phase boss fights for a physics-driven 2D action game in Phaser 4 (Intrusion 2 / Metal Slug / Contra-style run-and-gun). Trigger this whenever the user mentions enemy AI, enemy patterns, boss fight, boss phases, telegraphed attacks, weak points, arena changes, line-of-sight, or aggro/patrol behavior. This is a design-pattern layer -- it assumes ../physics-matter/SKILL.md, ../curves-and-paths/SKILL.md, ../time-and-timers/SKILL.md, ../events-system/SKILL.md, and ../tweens/SKILL.md (Phaser's own API skills) are already known, and it builds directly on ../ragdoll-destruction-combat/SKILL.md for death handling, structural damage, and combat feel. It does not re-explain those APIs, only how to compose them into readable, fair enemy and boss behavior."
---

# Enemy AI & Multi-Phase Boss Encounters (Intrusion 2 pattern)

> Another pattern layer, not an API reference. Enemy AI and boss design in this genre live or die
> on one rule: **every attack must be readable before it hurts you.** Intrusion 2's boss fights are
> its most-praised feature specifically because each screen-filling encounter reads like "a puzzle
> to solve" rather than a damage race -- reviewers call the physics and AI together "cinematic," but
> the actual player-facing mechanism is always: telegraph → window to react → consequence. Everything
> below is in service of that one rule.

## 1. A minimal FSM, not a library

You don't need a behavior-tree package for run-and-gun enemies. A plain object with a `state` string
and a `changeState` method is enough, and it stays debuggable in Chrome devtools.

```js
class EnemyAI {
    constructor(sprite, scene) {
        this.sprite = sprite;
        this.scene = scene;
        this.state = 'patrol';
        this.stateTime = 0;
    }

    changeState(next) {
        if (this.state === next) return;
        this.scene.events.emit('enemy-state-change', this.sprite, this.state, next);
        this.state = next;
        this.stateTime = 0;
    }

    update(time, delta) {
        this.stateTime += delta;
        switch (this.state) {
            case 'patrol':  this.patrol();  break;
            case 'aggro':   this.aggro();   break;
            case 'attack':  this.attack();  break;
            case 'cover':   this.takeCover(); break;
            case 'stagger': /* no input while staggered, see Section 4 */ break;
        }
    }
    // patrol/aggro/attack/takeCover implementations are enemy-specific, see Section 2
}
```

Drive `update()` from the scene's own `update(time, delta)` loop over a Group (see the official
`groups-and-containers` skill for pooling many enemies cheaply). Emitting a scene event on every
state change costs nothing and gives you a free hook for sound cues, UI markers, or debug overlays
later without touching the FSM itself.

## 2. Perception: line-of-sight, not omniscience

An enemy that reacts the instant it exists feels unfair. Gate aggro behind an actual sight check
using the ray query already exposed by the official Matter skill:

```js
hasLineOfSight(enemy, target) {
    // intersectRay returns bodies hit along the ray; if anything solid is
    // hit before the target, sight is blocked.
    const hits = this.scene.matter.intersectRay(
        enemy.x, enemy.y, target.x, target.y
    );
    return hits.length === 0 || hits[0].gameObject === target;
}
```

Combine with a max detection radius and a short delay before the state actually flips (0.2-0.4s) so
aggro doesn't snap on the first frame the player peeks around a corner -- that delay is itself a
fairness cue, giving the player a chance to duck back out.

## 3. Enemy archetypes (matching the reference game's roster)

Don't design one generic "enemy" and reskin it -- Intrusion 2's variety comes from different
*movement + attack pairings*, not different sprites:

- **Heavy walker** (ED-209-style): slow, tanky, short detection range, telegraphs a heavy attack
  with a 0.5-0.8s windup animation/tween before a high-damage hit. Good candidate for the "use the
  environment against it" pattern from `ragdoll-destruction-combat` Section 2 -- destroy its leg
  support and it topples.
- **Ranged skirmisher** (railgun paratrooper): fast, keeps distance, breaks line-of-sight and
  repositions rather than tanking hits (`state: 'cover'` when player has sight on them and their
  health is below a threshold).
- **Grappler**: fires a constraint-based hook at the player (literally `this.matter.add.constraint`
  from player to enemy, short-lived, removed on break-free input or after N seconds) to pull them
  into a bad position -- this is a direct, cheap reuse of Matter constraints for a gameplay verb, not
  just physics dressing.

Each archetype is a different `attack()` implementation on the same FSM shell from Section 1, not a
different class hierarchy.

## 4. Telegraph → window → consequence, formalized

This is the actual fairness mechanism, and it's the same three-step shape for every attack in the
game, enemy or boss:

```js
attack() {
    if (this.stateTime === 0) {
        // Step 1: telegraph -- visual/audio tell, no damage yet
        this.sprite.play('windup');
        this.scene.sound.play('sfx-windup');
    }
    if (this.stateTime > 600 && this.stateTime < 650) {
        // Step 2: the actual damage window -- narrow, so it reads as a single hit not a hitbox that lingers
        this.dealDamageIfOverlapping();
    }
    if (this.stateTime > 900) {
        this.changeState('cover'); // Step 3: recovery -- enemy is briefly vulnerable after attacking
    }
}
```

The recovery window in step 3 matters as much as the telegraph: it's what gives a skilled player a
reason to bait an attack on purpose. Never skip it, even for fast enemies -- shorten it instead.

## 5. Boss fights: phases as swappable attack sets, not HP bars

A boss is not "one enemy with more HP." Model each phase as an object holding its own attack list,
its own arena state, and an explicit transition condition:

```js
const phases = [
    {
        attacks: ['slam', 'chargeSweep'],
        arenaState: 'intact',
        transitionAt: hp => hp < 0.66,
    },
    {
        attacks: ['slam', 'chargeSweep', 'debrisThrow'],
        arenaState: 'platform-collapsed', // trigger destructible-structure logic here, see Section 2
        transitionAt: hp => hp < 0.33,
    },
    {
        attacks: ['desperate-flurry'],
        arenaState: 'final',
        weakPoint: true, // exposed core, big damage multiplier, ends the fight fast once reached
        transitionAt: () => false,
    },
];

function checkPhaseTransition(boss) {
    const next = phases[boss.phaseIndex + 1];
    if (next && next.transitionAt(boss.hpRatio)) {
        boss.phaseIndex++;
        this.scene.events.emit('boss-phase-change', boss, boss.phaseIndex);
        applyArenaState(this.scene, next.arenaState); // e.g. remove a constraint from a platform
    }
}
```

**Why arena state belongs on the phase object, not bolted on separately:** the reviews of Intrusion
2's bosses specifically praise fights that are "structured like a complex level to traverse" --
that only happens if the environment actually changes with the fight, which means the destructible-
structure hooks from `ragdoll-destruction-combat` need to be *callable from the boss's phase
transition*, not just from player damage.

**Scripted attack movement** -- use `curves-and-paths` for anything that isn't simple velocity
(a boss arm sweeping in an arc, a barrage of projectiles fired along a spline, a charge that curves
around terrain). This is the official skill's exact use case; don't hand-roll arc math in the boss
code when a `Path` + `PathFollower` already does it.

**Weak points and stagger** -- a weak point is a separate sensor body (`isSensor: true`) layered on
top of the boss's main body, listened to independently via `setOnCollideWith`. Hitting it should:
1. Trigger hit-stop and a bigger screen shake than a normal hit (`ragdoll-destruction-combat` Section 4).
2. Push the boss into a `stagger` state (no attacks, briefly) via the FSM in Section 1.
3. Count toward phase progress faster than body-mass hits, so aiming for the weak point is
   mechanically rewarded, not just a visual detail.

## 6. Checkpointing around long fights

Boss encounters in this genre run long (multiple minutes, multiple phases) -- the documented
complaint about the original game is dying deep into a fight with no safety net. Fire a checkpoint
event at every phase transition, not just at the start of the encounter:

```js
this.events.on('boss-phase-change', (boss, phaseIndex) => {
    this.events.emit('checkpoint-set', { bossPhase: phaseIndex, playerHp: this.player.hp });
});
```

This is a cheap insurance policy to build now even before the full save/progression skill exists --
it just needs *something* listening on `checkpoint-set` to persist it.

## Related skills

- `../physics-matter/SKILL.md` -- `intersectRay` for line-of-sight, constraints for the grappler hook.
- `../ragdoll-destruction-combat/SKILL.md` -- death handling, structural damage hooks called from
  phase transitions, hit-stop/shake/knockback reused for weak-point hits.
- `../curves-and-paths/SKILL.md` -- scripted boss attack trajectories.
- `../time-and-timers/SKILL.md` -- telegraph/window/recovery timing (`delayedCall`, `addEvent`).
- `../events-system/SKILL.md` -- `enemy-state-change`, `boss-phase-change`, `checkpoint-set` as the
  glue between AI, arena, camera, and (eventually) UI/save systems.
- `../groups-and-containers/SKILL.md` -- pooling many patrol/skirmisher enemies cheaply.
