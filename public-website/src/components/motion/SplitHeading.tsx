'use client';

import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from '../../lib/gsap';

interface SplitHeadingProps {
  text: string;
  className?: string;
  as?: 'h1' | 'h2' | 'h3';
  stagger?: number;
}

export const SplitHeading: React.FC<SplitHeadingProps> = ({
  text,
  className = '',
  as = 'h2',
  stagger = 0.04,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const words = text.split(' ');

  useGSAP(
    () => {
      const el = containerRef.current;
      if (!el) return;

      const spans = el.querySelectorAll('.split-word');
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set(spans, { opacity: 1, y: 0 });
      });

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          spans,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            stagger,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 90%',
              toggleActions: 'play none none none',
            },
          }
        );
      });
    },
    { scope: containerRef }
  );

  const Tag = as;

  return (
    <div ref={containerRef} className="overflow-hidden inline-block">
      <Tag className={className}>
        {words.map((word, i) => (
          <span key={i} className="split-word inline-block mr-[0.25em]">
            {word}
          </span>
        ))}
      </Tag>
    </div>
  );
};
