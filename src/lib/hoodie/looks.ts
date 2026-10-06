import type { GradientSpec, Technique } from './spec';

/**
 * Estilos de un clic: combinan la técnica (cómo se aplica) con un color o un
 * degradado. Pensados para que quien no sabe de producción consiga acabados
 * de marca sin tocar nada más.
 */
export interface Look {
  id: string;
  label: string;
  hint: string;
  technique: Technique;
  ink?: string;
  gradient?: GradientSpec;
}

export const LOOKS: Look[] = [
  { id: 'blanco', label: 'Blanco mate', hint: 'Serigrafía limpia', technique: 'Serigrafía Plana', ink: '#FFFFFF' },
  { id: 'plata', label: 'Plata reflectante', hint: 'Brilla con el flash', technique: 'Tinta Reflectante D3O/3M', ink: '#C9CED6' },
  {
    id: 'cromo',
    label: 'Cromo',
    hint: 'Aspecto cromado (consultar viabilidad)',
    technique: 'Tinta Reflectante D3O/3M',
    gradient: { from: '#FFFFFF', to: '#7C8591', angle: 90 },
  },
  {
    id: 'hielo',
    label: 'Hielo',
    hint: 'Reflectante azulado (consultar viabilidad)',
    technique: 'Tinta Reflectante D3O/3M',
    gradient: { from: '#BEE9FF', to: '#FFFFFF', angle: 135 },
  },
  { id: 'oro', label: 'Oro bordado', hint: 'Hilo en relieve', technique: 'Bordado Alto Relieve', ink: '#C8A24A' },
  {
    id: 'fuego',
    label: 'Fuego bordado',
    hint: 'Hilos en degradado (paleta a consultar)',
    technique: 'Bordado Alto Relieve',
    gradient: { from: '#FF2A00', to: '#FFB000', angle: 90 },
  },
  {
    id: 'atardecer',
    label: 'Atardecer',
    hint: 'Estampado en degradado',
    technique: 'Serigrafía Plana',
    gradient: { from: '#FF5F6D', to: '#FFC371', angle: 90 },
  },
  {
    id: 'neon',
    label: 'Neón',
    hint: 'Verde a azul eléctrico',
    technique: 'Serigrafía Plana',
    gradient: { from: '#00F5A0', to: '#00B8FF', angle: 45 },
  },
  { id: 'tono', label: 'Tono sobre tono', hint: 'Sólo se ve con la luz', technique: 'Bordado Ton-sur-Ton (Tono sobre Tono)' },
];
