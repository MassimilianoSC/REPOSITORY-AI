import { cn } from '@/lib/utils';

interface TrafficLightProps {
  status: 'green' | 'yellow' | 'red' | 'gray';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function TrafficLight({ status, size = 'md', className }: TrafficLightProps) {
  const colors = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    gray: 'bg-gray-400',
  };

  const sizes = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-12 h-12',
  };

  return (
    <div
      className={cn(
        'rounded-full',
        sizes[size],
        colors[status],
        className
      )}
      aria-label={`Status: ${status}`}
    />
  );
}
