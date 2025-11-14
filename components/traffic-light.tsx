import { cn } from '@/lib/utils';

interface TrafficLightProps {
  status: 'green' | 'yellow' | 'red' | 'gray';
  className?: string;
}

export function TrafficLight({ status, className }: TrafficLightProps) {
  const colors = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    gray: 'bg-gray-400',
  };

  return (
    <div
      className={cn(
        'w-3 h-3 rounded-full',
        colors[status],
        className
      )}
      aria-label={`Status: ${status}`}
    />
  );
}
