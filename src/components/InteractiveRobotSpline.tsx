import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const Spline = lazy(() => import('@splinetool/react-spline'));

interface InteractiveRobotSplineProps {
  scene: string;
  className?: string;
  headObjectName?: string;
  smile?: boolean;
}

interface SplineObjectLike {
  rotation?: {
    x: number;
    y: number;
  };
}

interface SplineAppLike {
  findObjectByName?: (name: string) => SplineObjectLike | undefined;
}

export default function InteractiveRobotSpline({
  scene,
  className,
  headObjectName = 'Head',
  smile = false,
}: InteractiveRobotSplineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const splineRef = useRef<SplineAppLike | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 15;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 15;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    if (!splineRef.current?.findObjectByName) return;
    const headObject = splineRef.current.findObjectByName(headObjectName);
    if (!headObject?.rotation) return;
    headObject.rotation.y = (mousePosition.x * Math.PI) / 180;
    headObject.rotation.x = (-mousePosition.y * Math.PI) / 180;
  }, [headObjectName, mousePosition]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-transparent">
            <Loader2 className="h-8 w-8 animate-spin text-slate-500/70" />
          </div>
        }
      >
        <Spline scene={scene} onLoad={(spline: SplineAppLike) => { splineRef.current = spline; }} />
      </Suspense>
      {smile && <span className="pointer-events-none absolute left-1/2 top-[58%] h-2.5 w-5 -translate-x-1/2 rounded-b-full border-b-2 border-rose-500/80" />}
    </div>
  );
}
