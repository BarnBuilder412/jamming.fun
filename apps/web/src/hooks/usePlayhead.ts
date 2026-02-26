import { useEffect, useRef, useState } from 'react';
import { createIntervalPlayhead } from '@jamming/audio-engine';

export function usePlayhead(bpm: number, isPlaying: boolean) {
  const controllerRef = useRef(createIntervalPlayhead(bpm));
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const controller = controllerRef.current;
    controller.setBpm(bpm);
    return controller.subscribe((step) => setStepIndex(step));
  }, [bpm]);

  useEffect(() => {
    const controller = controllerRef.current;
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
