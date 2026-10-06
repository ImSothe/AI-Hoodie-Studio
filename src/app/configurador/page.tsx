import type { Metadata, Viewport } from 'next';
import { ConfiguratorShell } from '@/components/configurator/ConfiguratorShell';
import { ATELIER } from '@/lib/configurator/collection';

export const metadata: Metadata = {
  title: `Configurador de taller — ${ATELIER.model}`,
  description: `Configure ${ATELIER.category.toLowerCase()} ${ATELIER.model} para producción: tejido, personalización, colocación, tallas y orden de taller.`,
};

export const viewport: Viewport = {
  themeColor: '#ECEAE6',
};

export default function ConfiguratorPage() {
  return <ConfiguratorShell />;
}
