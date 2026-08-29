import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ClerkLoadedDirective, ClerkLoadingDirective, ClerkSignInComponent } from 'ngx-clerk';
import { clerkConfig } from '../../../environments/clerk.config';
import { clerkAppearance } from '../../../environments/clerk-appearance';

@Component({
  selector: 'app-sign-in-page',
  standalone: true,
  imports: [ClerkSignInComponent, ClerkLoadedDirective, ClerkLoadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sentra-auth-shell flex min-h-screen items-center justify-center bg-background p-6">
      <div *clerkLoading class="text-sm text-muted-foreground">Cargando acceso…</div>
      <div *clerkLoaded>
        <clerk-sign-in
          [props]="{
            routing: 'path',
            path: signInPath,
            signUpUrl: signUpPath,
            forceRedirectUrl: afterSignInUrl,
            appearance: clerkAppearance,
          }"
        />
      </div>
    </div>
  `,
})
export class SignInPageComponent {
  readonly signInPath = clerkConfig.signInUrl;
  readonly signUpPath = clerkConfig.signUpUrl;
  readonly afterSignInUrl = clerkConfig.afterSignInUrl;
  readonly clerkAppearance = clerkAppearance;
}
