import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ClerkLoadedDirective, ClerkLoadingDirective, ClerkSignUpComponent } from 'ngx-clerk';
import { clerkConfig } from '../../../environments/clerk.config';
import { clerkAppearance } from '../../../environments/clerk-appearance';

@Component({
  selector: 'app-sign-up-page',
  standalone: true,
  imports: [ClerkSignUpComponent, ClerkLoadedDirective, ClerkLoadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sentra-auth-shell flex min-h-screen items-center justify-center bg-background p-6">
      <div *clerkLoading class="text-sm text-muted-foreground">Cargando registro…</div>
      <div *clerkLoaded>
        <clerk-sign-up
          [props]="{
            routing: 'path',
            path: signUpPath,
            signInUrl: signInPath,
            forceRedirectUrl: afterSignInUrl,
            appearance: clerkAppearance,
          }"
        />
      </div>
    </div>
  `,
})
export class SignUpPageComponent {
  readonly signInPath = clerkConfig.signInUrl;
  readonly signUpPath = clerkConfig.signUpUrl;
  readonly afterSignInUrl = clerkConfig.afterSignInUrl;
  readonly clerkAppearance = clerkAppearance;
}
