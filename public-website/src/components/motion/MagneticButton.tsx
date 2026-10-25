'use client';

import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from '../../lib/gsap';

interface MagneticButtonProps {
  children: React.ReactNode;
  className?: string;
  strength?: number;
  onClick?: () => void;
}

export const MagneticButton: React.FC<MagneticButtonProps> = ({
  children,
  className = '',
  strength = 0.3,
  onClick,
}) => {
  const btnRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = btnRef.current;
      if (!el) return;

      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: reduce)', () => {
        // No magnetic movement for reduced motion
      });

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const handleMouseMove = (e: MouseEvent) => {
          const rect = el.getBoundingClientRect();
          const relX = e.clientX - (rect.left + rect.width / 2);
          const relY = e.clientY - (rect.top + rect.height / 2);

          gsap.to(el, {
            x: relX * strength,
            y: relY * strength,
            duration: 0.3,
            ease: 'power2.out',
          });
        };

        const handleMouseLeave = () => {
          gsap.to(el, {
            x: 0,
            y: 0,
            duration: 0.5,
            ease: 'elastic.out(1, 0.4)',
          });
        };

        el.addEventListener('mousemove', handleMouseMove);
        el.addEventListener('mouseleave', handleMouseLeave);

        return () => {
          el.removeEventListener('mousemove', handleMouseMove);
          el.removeEventListener('mouseleave', handleMouseLeave);
        };
      });
    },
    { scope: btnRef }
  );

  return (
    <div ref={btnRef} className={`inline-block ${className}`} onClick={onClick}>
      {children}
    </div>
  );
};
