import React from 'react';
import { Filter } from 'lucide-react';
import { useStore } from '../../store/useStore';

export function GraphControls() {
  const filterThreats = useStore((s) => s.filterThreats);
  const toggleFilterThreats = useStore((s) => s.toggleFilterThreats);
  const traceResult = useStore((s) => s.traceResult);
  const result = traceResult;

  return null;
}

