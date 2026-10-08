// A victim's cartoon face, drawn as SVG from their FaceLook (shapes in ui/faceParts). The
// eyebrows and resting mouth follow `mood`. Every frame (outside React, so it's cheap) it
// blinks now and then, bobs gently, and opens the mouth with the voice's loudness while
// `speaking`, even when the voice is muted; with no audio to follow, the mouth just flaps.

import { type ReactElement, useEffect, useMemo, useRef } from "react";
import { Config } from "@shared/Config";
import { MsPerSecond } from "@shared/time";
import type { FaceLook } from "@shared/types";
import {
  approach,
  EyeHeight,
  EyeWidth,
  EyeY,
  FaceColors,
  type FacePart,
  faceParts,
  Layer,
  LeftEyeX,
  type Mood,
  MouthY,
  Poses,
  RightEyeX,
} from "@client/ui/faceParts";
import { victimLoudness } from "@client/voice/VictimVoice";
import styles from "@client/ui/Face.module.css";

// Outline thickness, in the face's 100-unit square.
const OutlineWidth = 1.4;
// Room around the square so outlines at the edges aren't cut off.
const Margin = 3;
const ViewBox = `${-Margin} ${-Margin} ${100 + Margin * 2} ${100 + Margin * 2}`;
const BrowWidth = 12;
const BrowHeight = 2.2;
const Percent = 100;
const FullTurn = 2 * Math.PI;

function Shape({ shape }: { shape: FacePart }): ReactElement {
  const { x, y, width, height, rounded, outlined, rotation, opacity, hollow } = shape;
  return (
    <rect
      x={x - width / 2}
      y={y - height / 2}
      width={width}
      height={height}
      rx={rounded ? Math.min(width, height) / 2 : 0}
      fill={hollow ? "none" : shape.fill}
      opacity={opacity}
      stroke={outlined ? FaceColors.Outline : undefined}
      strokeWidth={outlined ? OutlineWidth : undefined}
      transform={rotation ? `rotate(${rotation} ${x} ${y})` : undefined}
    />
  );
}

function Brow({ x, mood, side }: { x: number; mood: Mood; side: "left" | "right" }): ReactElement {
  const pose = Poses[mood][side];
  return (
    <g
      className={styles.brow}
      style={{
        transform: `translate(${x}px, ${pose.y}px) rotate(${pose.rotation}deg)`,
        transitionDuration: `${Config.Face.BrowSeconds}s`,
      }}
    >
      <rect
        x={-BrowWidth / 2}
        y={-BrowHeight / 2}
        width={BrowWidth}
        height={BrowHeight}
        rx={BrowHeight / 2}
        fill={FaceColors.Outline}
      />
    </g>
  );
}

/** The mood's mouth when not talking: a line, a smirk, or an open grin or frown. */
function RestingMouth({ mood }: { mood: Mood }): ReactElement {
  const outline = { stroke: FaceColors.Outline, strokeWidth: OutlineWidth };
  switch (Poses[mood].mouth) {
    case "line":
      return (
        <rect x={43} y={MouthY - 1.1} width={14} height={2.2} rx={1.1} fill={FaceColors.Outline} />
      );
    case "smirk":
      return (
        <rect
          x={46}
          y={MouthY - 1.1}
          width={12}
          height={2.2}
          rx={1.1}
          fill={FaceColors.Outline}
          transform={`rotate(-10 52 ${MouthY})`}
        />
      );
    case "smile":
      // The bottom half of an oval, open.
      return (
        <path
          d={`M 40 ${MouthY - 3} A 10 9 0 0 0 60 ${MouthY - 3} Z`}
          fill={FaceColors.MouthInside}
          {...outline}
        />
      );
    case "frown":
      // The top half of an oval, open.
      return (
        <path
          d={`M 42 ${MouthY + 4} A 8 7 0 0 1 58 ${MouthY + 4} Z`}
          fill={FaceColors.MouthInside}
          {...outline}
        />
      );
  }
}

export interface FaceProps {
  look: FaceLook;
  mood: Mood;
  // True during the victim's turn: the mouth follows their voice.
  speaking: boolean;
}

export function Face({ look, mood, speaking }: FaceProps): ReactElement {
  const parts = useMemo(() => faceParts(look), [look]);
  const rigRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const restingRef = useRef<SVGGElement>(null);
  const talkRef = useRef<SVGRectElement>(null);
  const speakingRef = useRef(speaking);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  // The per-frame motion: blinking, bobbing and the talking mouth.
  useEffect(() => {
    const tuning = Config.Face;
    const stillMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const randomGap = (): number =>
      tuning.BlinkMinSeconds + Math.random() * (tuning.BlinkMaxSeconds - tuning.BlinkMinSeconds);
    let clock = 0;
    let last = performance.now();
    let nextBlinkAt = randomGap();
    let blinkEndsAt = 0;
    let eyesClosed = false;
    let mouthOpen = 0;
    let talking = false;
    let frame = requestAnimationFrame(tick);

    function tick(now: number): void {
      const dt = Math.min((now - last) / MsPerSecond, 1);
      last = now;
      clock += dt;

      // The mouth opens quickly and closes a little slower, so it reads as speech.
      let target = 0;
      if (speakingRef.current) {
        const loudness = victimLoudness();
        target = loudness ?? (Math.sin(clock * tuning.FlapSpeed) + 1) / 2;
      }
      const speed = target > mouthOpen ? tuning.MouthOpenSpeed : tuning.MouthCloseSpeed;
      mouthOpen = approach(mouthOpen, target, speed * dt);
      const nowTalking = mouthOpen > tuning.MouthShowThreshold;
      if (nowTalking !== talking) {
        talking = nowTalking;
        restingRef.current?.setAttribute("visibility", talking ? "hidden" : "visible");
        talkRef.current?.setAttribute("visibility", talking ? "visible" : "hidden");
      }
      if (talking && talkRef.current) {
        const height =
          (tuning.TalkMinHeight + (tuning.TalkMaxHeight - tuning.TalkMinHeight) * mouthOpen) *
          Percent;
        talkRef.current.setAttribute("y", String(MouthY - height / 2));
        talkRef.current.setAttribute("height", String(height));
      }

      // Blink every few seconds, at random.
      if (clock >= nextBlinkAt) {
        blinkEndsAt = clock + tuning.BlinkSeconds;
        nextBlinkAt = clock + randomGap();
      }
      const closed = clock < blinkEndsAt;
      if (closed !== eyesClosed) {
        eyesClosed = closed;
        if (closed) {
          eyesRef.current?.setAttribute(
            "transform",
            `translate(0 ${EyeY}) scale(1 ${tuning.BlinkEyeHeight}) translate(0 ${-EyeY})`,
          );
        } else {
          eyesRef.current?.removeAttribute("transform");
        }
      }

      // A gentle up-and-down bob, as if breathing.
      const bob = stillMotion.matches
        ? 0
        : Math.sin((clock * FullTurn) / tuning.BobPeriodSeconds) * tuning.BobAmount * Percent;
      rigRef.current?.setAttribute("transform", `translate(0 ${bob})`);
      frame = requestAnimationFrame(tick);
    }

    return () => cancelAnimationFrame(frame);
  }, []);

  const talkWidth = Config.Face.TalkWidth * Percent;
  const talkHeight = Config.Face.TalkMinHeight * Percent;
  // Shapes on each layer, with the moving parts slotted in at theirs.
  const layers = Object.values(Layer);
  return (
    <svg className={styles.face} viewBox={ViewBox} role="img" aria-label="The caller's face">
      <g ref={rigRef}>
        {layers.map((layer) => (
          <g key={layer}>
            {parts
              .filter((shape) => shape.layer === layer)
              .map((shape, index) => (
                <Shape key={index} shape={shape} />
              ))}
            {layer === Layer.Details && (
              <>
                <g ref={restingRef}>
                  <RestingMouth mood={mood} />
                </g>
                <rect
                  ref={talkRef}
                  visibility="hidden"
                  x={50 - talkWidth / 2}
                  y={MouthY - talkHeight / 2}
                  width={talkWidth}
                  height={talkHeight}
                  rx={talkWidth / 2}
                  fill={FaceColors.MouthInside}
                  stroke={FaceColors.Outline}
                  strokeWidth={OutlineWidth}
                />
              </>
            )}
            {layer === Layer.Eyes && (
              <g ref={eyesRef}>
                {[LeftEyeX, RightEyeX].map((x) => (
                  <rect
                    key={x}
                    x={x - EyeWidth / 2}
                    y={EyeY - EyeHeight / 2}
                    width={EyeWidth}
                    height={EyeHeight}
                    rx={EyeWidth / 2}
                    fill={FaceColors.Outline}
                  />
                ))}
              </g>
            )}
            {layer === Layer.Brows && (
              <>
                <Brow x={LeftEyeX} mood={mood} side="left" />
                <Brow x={RightEyeX} mood={mood} side="right" />
              </>
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}
