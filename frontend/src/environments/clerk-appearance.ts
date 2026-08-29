import type { ClerkOptions } from 'ngx-clerk';

/**
 * Clerk + Tailwind v4: cssLayerName evita que utilities pisen los estilos del formulario.
 * @see https://clerk.com/docs/guides/customizing-clerk/appearance-prop/bring-your-own-css
 */
export const clerkAppearance: NonNullable<ClerkOptions['appearance']> = {
  cssLayerName: 'clerk',
  variables: {
    colorPrimary: '#0891b2',
    colorText: '#0f1520',
    colorInputText: '#0f1520',
    colorInputBackground: '#ffffff',
    colorBackground: '#ffffff',
    borderRadius: '6px',
  },
};

/** Perfil embebido en Ajustes — ancho contenido y bordes redondeados. */
export const clerkProfileAppearance: NonNullable<ClerkOptions['appearance']> = {
  ...clerkAppearance,
  elements: {
    rootBox: 'w-full max-w-full',
    cardBox: 'w-full max-w-full rounded-[10px] shadow-none',
    card: 'w-full max-w-full rounded-[10px]',
    scrollBox: 'rounded-[10px]',
    navbar: 'rounded-t-[10px]',
  },
};
