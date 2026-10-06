import type { Metadata } from 'next';
import { PatternShell } from '@/components/pattern/PatternShell';

export const metadata: Metadata = {
  title: 'Patrón — AI Hoodie Studio',
  description: 'Estampado continuo por patrón: diseñe sobre las piezas planas y véalo cosido en la prenda 3D.',
};

export default function PatternPage() {
  return <PatternShell />;
}
