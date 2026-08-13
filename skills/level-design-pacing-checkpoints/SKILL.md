---
name: level-design-pacing-checkpoints
description: "Use this skill when structuring levels, placing checkpoints, pacing encounters, or authoring trigger zones for a physics-driven 2D action game in Phaser 4 (Intrusion 2 / Metal Slug / Contra-style run-and-gun). Trigger this whenever the user mentions level design, level pacing, checkpoints, respawn, trigger zones, encounter design, camera bounds per section, or Tiled object layers used for gameplay logic. This is a design-pattern layer -- it assumes ../tilemaps/SKILL.md, ../cameras/SKILL.md, ../data-manager/SKILL.md, and ../events-system/SKILL.md (Phaser's own API skills) are already known, and it consumes the checkpoint and destructible-state events already emitted by ../ragdoll-destruction-combat/SKILL.md and ../enemy-ai-boss-encounters/SKILL.md rather than re-deriving them."
---

# Level Design, Pacing & Checkpoints (Intrusion 2 pattern)

> This skill closes a loop the previous two left open on purpose. `ragdoll-destruction-combat`
> destroys structures permanently and `enemy-ai-boss-encounters` emits a `checkpoint-set` event on
> every boss phase -- but nothing has been listening yet, and naive checkpointing in a world with
> *permanent* destruction has a specific trap that doesn't show up in games without it. That trap is
> Section 2, and it's the main reason this skill exists rather than being "just add a respawn point."

## 1. Levels as segments, not one continuous stretch

Structure a level as an ordered list of segments, each with its own camera bounds, its own set of
"toys" (physics objects, weapons, enemy archetypes available), and an explicit pacing role:

```js
const segment = {
    id: 'segment-3',
    cameraBounds: { x: 1800, y: 0, w: 1200, h: 600 },
    role: 'escalate',        // 'intro' | 'escalate' | 'breather' | 'climax'
    checkpointOnEnter: true,
};
```

The **pacing role** is the actual design tool, not decoration:
- `intro` -- exactly one new element (one enemy archetype, or one weapon, or one physics toy like a
  swinging bridge) in isolation, low threat, so the player learns it without pressure.
- `escalate` -- combine that new element with something already known. This is where most of a
  level's actual content lives.
- `breather` -- traversal only, no combat, no destruction spectacle. Physics-heavy games need this
  more than most genres: screen shake, debris, and explosions have real fatigue, and a level that's
  climax-density from start to finish reads as exhausting rather than exciting.
- `climax` -- boss or set-piece; hands off to `enemy-ai-boss-encounters` for the encounter itself.

Author segment boundaries and camera-bounds changes as **Tiled object-layer entries** (a rectangle
object named `segment-3` with custom properties for `role`), read at runtime with the tilemaps
skill's `getObjectLayer`/`createFromObjects` -- this keeps level pacing editable by a designer (or
by an AI agent iterating on a `.json` map) without touching gameplay code.

## 2. The checkpoint trap: destruction doesn't undo itself

This is the part that's easy to get wrong. A normal platformer checkpoint just needs `{ x, y, hp }`.
Here, if a guard tower fell or a bridge got blown up *before* the checkpoint, and the player dies
*after* it, respawning at the checkpoint with the tower magically standing again is jarring and can
even softlock a puzzle-like destruction sequence. The world state at a checkpoint is not just the
player's state -- it's every irreversible change made to reach that point.

```js
// Listen for the events already emitted by the other two skills.
this.events.on('checkpoint-set', (payload) => {
    this.registry.set('checkpoint', {
        x: payload.playerX, y: payload.playerY,
        hp: payload.playerHp,
        weapons: payload.weaponState,
        bossPhase: payload.bossPhase ?? null,
        // The part that's easy to forget:
        removedConstraintIds: [...this.destroyedConstraintLog],
        destroyedBodyIds: [...this.destroyedBodyLog],
    });
});

// Every destructible-structure break (from ragdoll-destruction-combat Section 2) logs itself:
function damageTower(scene, tower, hitPoint) {
    // ...existing break logic...
    scene.destroyedConstraintLog.push(tower.support.id);
}
```

On respawn: **rebuild the level from its original Tiled/JSON definition, then silently replay the
logged removals** -- silently meaning `matter.world.removeConstraint` and `setStatic(false)` again,
but skip the explosion FX, camera shake, and sound that played the first time. The world ends up in
the same physical state without re-showing the player an explosion that already happened.

```js
function restoreFromCheckpoint(scene, checkpoint) {
    scene.scene.restart(); // rebuild level from scratch
    scene.events.once('level-ready', () => {
        checkpoint.removedConstraintIds.forEach(id => scene.removeConstraintSilently(id));
        checkpoint.destroyedBodyIds.forEach(id => scene.destroyBodySilently(id));
        scene.player.setPosition(checkpoint.x, checkpoint.y);
        scene.player.hp = checkpoint.hp;
        if (checkpoint.bossPhase !== null) scene.boss.jumpToPhase(checkpoint.bossPhase);
    });
}
```

`this.registry` (official `data-manager` skill) is the right tool for this specifically because it
survives a `scene.restart()` -- scene-local `this.data` would not, since restart tears the scene
down.

**Session vs. persisted:** `registry` alone only survives within the running page -- it resets on a
real page reload. If checkpoints should survive that too, serialize the same object to
`localStorage` (this is real production game code, not a Claude artifact preview, so browser storage
is fine here) whenever `checkpoint-set` fires, and hydrate the registry from it once at boot.

## 3. Checkpoint placement rules

- One at the start of every segment marked `checkpointOnEnter`.
- One on every `boss-phase-change` (already handled if you wired the event from
  `enemy-ai-boss-encounters` -- this skill is the missing listener, not new emitting logic).
- Never mid-`escalate` if the segment is short; players should be able to re-attempt a whole
  escalation beat, not resume halfway through learning a combination.
- Do place one immediately before any single environmental hazard that can one-shot (a scripted
  collapse, an instant-kill pit) -- per-hazard checkpoints, not per-timer, are what actually removes
  frustration without removing challenge.

## 4. Toybox curation per segment

Don't scatter every physics object type into every segment. Each segment's `role` should map to an
explicit, small list of which destructible structures, throwables, and enemy archetypes are *allowed
to appear* in it -- authored as Tiled object-layer entries (spawn points with a `type` property),
not hardcoded per level. This is what makes an `intro` segment actually read as an intro: if the
level file only places one enemy type and one physics toy in that segment's spawn objects, the
pacing is enforced by data, not by hoping the player notices.

## 5. Camera bounds and look-ahead per segment

Swap `camera.setBounds()` on segment transition (official `cameras` skill) rather than setting one
bounds for the whole level -- this is what lets vertical set-pieces (a tower climb, a collapsing
platform sequence) get a taller/narrower bounds box exactly where they need it. For aim-driven
combat, bias `setFollowOffset` slightly toward the mouse/aim direction during `escalate`/`climax`
segments so the player can see what they're shooting at without the camera fighting their aim.

## Related skills

- `../tilemaps/SKILL.md` -- `getObjectLayer`, `createFromObjects` for authoring segments, spawn
  points, and toybox entries as data instead of code.
- `../cameras/SKILL.md` -- per-segment `setBounds`/`setFollowOffset`.
- `../data-manager/SKILL.md` -- `this.registry` for checkpoint state that survives `scene.restart()`.
- `../events-system/SKILL.md` -- consuming `checkpoint-set` and `boss-phase-change` from the other
  two skills rather than re-deriving them.
- `../ragdoll-destruction-combat/SKILL.md` -- the source of `destroyedConstraintLog`/removal calls
  that Section 2 replays on restore.
- `../enemy-ai-boss-encounters/SKILL.md` -- `boss-phase-change`/`checkpoint-set` emitters this skill
  listens to; `jumpToPhase` on restore.
