import { useEffect, useRef, useState } from 'react';
import { createIntervalPlayhead } from '@jamming/audio-engine';
import { STEPS_PER_PATTERN_V1 } from '@jamming/shared-types';

export function usePlayhead(bpm: number, isPlaying: boolean, stepsPerPattern: number = STEPS_PER_PATTERN_V1) {
  const controllerRef = useRef<ReturnType<typeof createIntervalPlayhead> | null>(null);
  const bpmRef = useRef(bpm);
  const isPlayingRef = useRef(isPlaying);
  const [stepIndex, setStepIndex] = useState(0);

  bpmRef.current = bpm;
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    const controller = createIntervalPlayhead(bpmRef.current, stepsPerPattern);
    controllerRef.current = controller;
    setStepIndex(0);
    const unsubscribe = controller.subscribe((step) => setStepIndex(step));
    if (isPlayingRef.current) {
      controller.start();
    }

    return () => {
      unsubscribe();
      controller.stop();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [stepsPerPattern]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) {
      return;
    }
    controller.setBpm(bpm);
  }, [bpm]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) {
      return;
    }
    if (isPlaying) {
      controller.start();
    } else {
      controller.stop();
    }

    return () => {
      controller.stop();
    };
  }, [isPlaying]);

  return stepIndex;
}
