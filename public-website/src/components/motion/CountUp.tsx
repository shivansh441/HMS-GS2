'use client';

import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from '../../lib/gsap';

interface CountUpProps {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export const CountUp: React.FC<CountUpProps> = ({
  end,
  duration = 2,
  prefix = '',
  suffix = '',
  className = '',
}) => {
  const numRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = numRef.current;
      if (!el) return;

      const obj = { val: 0 };
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: reduce)', () => {
        el.textContent = `${prefix}${end}${suffix}`;
      });

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.to(obj, {
          val: end,
          duration,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 90%',
            toggleActions: 'play none none none',
          },
          onUpdate: () => {
            el.textContent = `${prefix}${Math.floor(obj.val)}${suffix}`;
          },
        });
      });
    },
    { scope: numRef }
  );

  return (
    <span ref={numRef} className={className}>
      {prefix}0{suffix}
    </span>
  );
};
