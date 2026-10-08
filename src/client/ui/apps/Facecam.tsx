// Facecam app: the player's webcam with a call-center headset drawn on them (it follows the
// head), and a stinky aroma unless the player turns it off, for streaming. Off until the
// player turns it on (the only time the game asks for the camera). Everything happens on
// this device: nothing is recorded, uploaded or sent to an AI. The camera turns off when the
// window closes, the tab is hidden or the title menu covers the desk.

import {
  type ChangeEvent,
  type CSSProperties,
  type ReactElement,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Config } from "@shared/Config";
import { MsPerSecond } from "@shared/time";
import {
  cameraProblemFor,
  closeCamera,
  openCamera,
  type CameraProblem,
} from "@client/facecam/camera";
import { setStinky, useStinky } from "@client/facecam/facecamSettingsStore";
import {
  type FacecamFailure,
  type FacecamFrame,
  FacecamSession,
} from "@client/facecam/facecamSession";
import { type FaceTracker, loadFaceTracker } from "@client/facecam/faceTracker";
import type { HeadsetPose } from "@client/facecam/headsetPose";
import { cx } from "@client/ui/classNames";
import { useDesktop } from "@client/ui/DesktopContext";
import { StinkCloud, StinkHaze } from "@client/ui/StinkCloud";
import { useTitleMenuShown } from "@client/ui/useTitleMenuShown";
import controls from "@client/ui/controls.module.css";
import app from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/Facecam.module.css";

type Problem = CameraProblem | FacecamFailure | "tracker";

const ProblemText: Record<Problem, string> = {
  unsupported: "This browser can't share a camera with this page.",
  denied: "Camera access was turned down. Allow it in the browser's site settings, then try again.",
  missing: "No camera was found.",
  busy: "The camera is busy in another app.",
  failed: "The camera couldn't start.",
  camera: "The camera was disconnected.",
  tracker: "Face tracking can't run in this browser.",
  tracking: "Face tracking stopped, so the camera was turned off.",
};

const Percent = 100;
const StinkSlots = Array.from({ length: Config.Facecam.MaxFaces }, (_, index) => index);

/** `promise`, or a rejection if it takes longer than Config.Facecam.StartTimeoutSeconds. */
function withStartTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(
      () => reject(new Error("The facecam took too long to start.")),
      Config.Facecam.StartTimeoutSeconds * MsPerSecond,
    );
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function subscribeToVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** Moves a stink cloud's box round the head of `headset` (or hides it), in a picture `width`
 * by `height` pixels. */
function placeStink(
  element: HTMLDivElement | null | undefined,
  headset: HeadsetPose | undefined,
  width: number,
  height: number,
): void {
  if (!element) {
    return;
  }
  if (!headset) {
    element.style.visibility = "hidden";
    return;
  }
  const size = headset.headWidth * Config.Facecam.StinkSize;
  element.style.left = `${(headset.bandCenter.x / width) * Percent}%`;
  element.style.top = `${(headset.bandCenter.y / height) * Percent}%`;
  element.style.width = `${(size / width) * Percent}%`;
  element.style.transform = `translate(-50%, -50%) rotate(${headset.roll}rad)`;
  element.style.visibility = "visible";
}

export function Facecam(): ReactElement {
  const { store } = useDesktop();
  const menuShown = useTitleMenuShown(store);
  const hidden = useSyncExternalStore(subscribeToVisibility, () => document.hidden);
  const stinky = useStinky();

  // The player wants it on; it runs only while the game is in view.
  const [wantOn, setWantOn] = useState(false);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [aspect, setAspect] = useState(Config.Facecam.VideoWidth / Config.Facecam.VideoHeight);
  const active = wantOn && !hidden && !menuShown;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stinkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lostRef = useRef<HTMLParagraphElement>(null);
  const shownAspect = useRef(aspect);
  const trackerLoad = useRef<Promise<FaceTracker> | null>(null);

  // The tracker loads once, the first time it's needed, and closes with the window.
  useEffect(
    () => () => {
      trackerLoad.current?.then(
        (tracker) => tracker.close(),
        () => undefined,
      );
    },
    [],
  );

  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    let session: FacecamSession | null = null;
    // The same list the stink clouds' ref callbacks fill in.
    const stinkElements = stinkRefs.current;

    // Throws the tracker away (closing it once it's loaded), so the next try loads a fresh one.
    function dropTracker(): void {
      const load = trackerLoad.current;
      trackerLoad.current = null;
      load?.then(
        (tracker) => tracker.close(),
        () => undefined,
      );
    }

    function fail(reason: Problem): void {
      if (reason === "tracking") {
        dropTracker();
      }
      setProblem(reason);
      setWantOn(false);
    }

    function showFrame({ headsets, width, height }: FacecamFrame): void {
      const nextAspect = width / height;
      if (nextAspect !== shownAspect.current) {
        shownAspect.current = nextAspect;
        setAspect(nextAspect);
      }
      if (lostRef.current) {
        lostRef.current.style.visibility = headsets.length === 0 ? "visible" : "hidden";
      }
      StinkSlots.forEach((slot) => {
        placeStink(stinkRefs.current[slot], headsets[slot], width, height);
      });
    }

    async function start(): Promise<void> {
      let tracker: FaceTracker;
      const load = (trackerLoad.current ??= loadFaceTracker());
      try {
        tracker = await withStartTimeout(load);
      } catch {
        // A cancelled try leaves the tracker alone: a newer try may be waiting for it too.
        if (cancelled) {
          return;
        }
        if (trackerLoad.current === load) {
          dropTracker();
        }
        fail("tracker");
        return;
      }
      if (cancelled) {
        return;
      }

      let stream: MediaStream;
      try {
        stream = await openCamera();
      } catch (error) {
        if (!cancelled) {
          fail(cameraProblemFor(error));
        }
        return;
      }
      const canvas = canvasRef.current;
      if (cancelled || !canvas) {
        closeCamera(stream);
        return;
      }

      session = new FacecamSession({
        canvas,
        stream,
        tracker,
        onFrame: showFrame,
        onFail: fail,
      });
      try {
        await withStartTimeout(session.start());
      } catch {
        session.stop();
        if (!cancelled) {
          fail("failed");
        }
        return;
      }
      if (!cancelled) {
        setRunning(true);
      }
    }

    void start();
    return () => {
      cancelled = true;
      session?.stop();
      setRunning(false);
      // So no cloud shows where the head was last time when it starts again.
      for (const element of stinkElements) {
        if (element) {
          element.style.visibility = "hidden";
        }
      }
    };
  }, [active]);

  function toggle(): void {
    setProblem(null);
    setWantOn(!wantOn);
  }

  let status: string;
  if (problem) {
    status = ProblemText[problem];
  } else if (!wantOn) {
    status = "Camera off. Your video stays on this computer: nothing is recorded or uploaded.";
  } else if (!active) {
    status = "Paused while the game is out of view.";
  } else if (!running) {
    status = "Starting the camera...";
  } else {
    status = "Camera on. You're on the help line now.";
  }

  return (
    <div className={app.app}>
      <div className={styles.stageArea}>
        <div
          className={styles.stage}
          style={{ "--aspect": aspect } satisfies Record<`--${string}`, number> as CSSProperties}
        >
          <canvas
            ref={canvasRef}
            className={cx(styles.picture, !running && styles.hidden)}
            aria-label="Your facecam"
          />
          {running && stinky && <StinkHaze />}
          {stinky &&
            StinkSlots.map((slot) => (
              <div
                key={slot}
                ref={(element) => {
                  stinkRefs.current[slot] = element;
                }}
                className={cx(styles.stink, !running && styles.hidden)}
              >
                <StinkCloud />
              </div>
            ))}
          {running ? (
            <p ref={lostRef} className={styles.lost}>
              Looking for your face...
            </p>
          ) : (
            <p className={styles.off} aria-hidden="true">
              📷
            </p>
          )}
        </div>
      </div>
      <div className={app.row}>
        <label className={styles.option}>
          <input
            type="checkbox"
            checked={stinky}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setStinky(event.target.checked)}
          />
          Stinky
        </label>
        <button type="button" className={controls.button} onClick={toggle}>
          {wantOn ? "Turn camera off" : "Turn camera on"}
        </button>
      </div>
      <p className={cx(controls.sunken, app.status)} role="status">
        {status}
      </p>
    </div>
  );
}
