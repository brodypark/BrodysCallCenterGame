import { describe, expect, it } from "vitest";
import { Config, type PetBehavior } from "@shared/Config";
import { type PetState, startPet, stepPet, wakePet } from "@client/ui/petRules";

const Walker: PetBehavior = { speed: 0.1, sitSeconds: [2, 2], napChance: 0, napSeconds: [5, 5] };
const Napper: PetBehavior = { ...Walker, napChance: 1 };
const Rock: PetBehavior = { ...Walker, speed: 0 };

// Always the same "random" number.
const always =
  (value: number): (() => number) =>
  () =>
    value;

function sitting(x: number, secondsLeft = 2): PetState {
  return { x, facing: 1, mode: "sitting", targetX: x, secondsLeft };
}

describe("petRules", () => {
  it("starts sitting inside the edges", () => {
    const pet = startPet(Walker, always(0));
    expect(pet.mode).toBe("sitting");
    expect(pet.x).toBe(Config.Pets.EdgeMargin);
    expect(startPet(Walker, always(0.999)).x).toBe(1 - Config.Pets.EdgeMargin);
  });

  it("sits until its time is up, then walks somewhere far enough away", () => {
    let pet = stepPet(sitting(0.5), Walker, 1, always(0));
    expect(pet).toMatchObject({ mode: "sitting", secondsLeft: 1 });
    pet = stepPet(pet, Walker, 1, always(0));
    expect(pet.mode).toBe("walking");
    expect(Math.abs(pet.targetX - pet.x)).toBeGreaterThanOrEqual(Config.Pets.MinWalkDistance);
    expect(pet.facing).toBe(pet.targetX < pet.x ? -1 : 1);
  });

  it("walks at its speed and sits down when it arrives", () => {
    const walking: PetState = { x: 0.2, facing: 1, mode: "walking", targetX: 0.5, secondsLeft: 0 };
    const moved = stepPet(walking, Walker, 1, always(0));
    expect(moved.x).toBeCloseTo(0.3);
    const arrived = stepPet(moved, Walker, 5, always(0));
    expect(arrived).toMatchObject({ x: 0.5, mode: "sitting", secondsLeft: 2 });
  });

  it("walks left towards a target on the left", () => {
    const pet = stepPet(sitting(0.9, 0), Walker, 0, always(0));
    expect(pet).toMatchObject({ mode: "walking", facing: -1 });
    expect(pet.targetX).toBeLessThan(0.9);
  });

  it("naps instead of walking now and then, and clicking wakes it", () => {
    const napping = stepPet(sitting(0.5, 0), Napper, 0, always(0));
    expect(napping).toMatchObject({ mode: "napping", secondsLeft: 5 });
    // Waking up never leads straight into another nap.
    expect(stepPet(napping, Napper, 5, always(0)).mode).toBe("walking");
    expect(wakePet(napping, Napper, always(0))).toMatchObject({ mode: "sitting", secondsLeft: 2 });
    const awake = sitting(0.5);
    expect(wakePet(awake, Napper, always(0))).toBe(awake);
  });

  it("never moves a pet with no speed (the rock)", () => {
    let pet = sitting(0.4, 0);
    for (let frame = 0; frame < 100; frame += 1) {
      pet = stepPet(pet, Rock, 1, always(0.7));
    }
    expect(pet).toMatchObject({ x: 0.4, mode: "sitting" });
  });

  it("sits down where it is if it stops being able to move mid-walk", () => {
    const walking: PetState = { x: 0.2, facing: 1, mode: "walking", targetX: 0.5, secondsLeft: 0 };
    expect(stepPet(walking, Rock, 0.1, always(0))).toMatchObject({ x: 0.2, mode: "sitting" });
  });

  it("stays inside the edges wherever it walks", () => {
    let pet = startPet(Walker, Math.random);
    for (let frame = 0; frame < 2000; frame += 1) {
      pet = stepPet(pet, Walker, 0.1, Math.random);
      expect(pet.x).toBeGreaterThanOrEqual(Config.Pets.EdgeMargin);
      expect(pet.x).toBeLessThanOrEqual(1 - Config.Pets.EdgeMargin);
    }
  });
});
