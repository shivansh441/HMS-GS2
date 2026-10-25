'use client';

import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from '../../lib/gsap';

interface ParallaxProps {
  children: React.ReactNode;
  speed?: number; // e.g. -40 or 40
  className?: string;
}

export const Parallax: React.FC<ParallaxProps> = ({ children, speed = 30, className = '' }) => {
  const targetRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = targetRef.current;
      if (!el) return;

      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set(el, { y: 0 });
      });

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.to(el, {
          y: speed,
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        });
      });
    },
    { scope: targetRef }
  );

  return (
    <div ref={targetRef} className={className}>
      {children}
    </div>
  );
};
