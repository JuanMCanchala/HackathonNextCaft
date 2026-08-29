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
