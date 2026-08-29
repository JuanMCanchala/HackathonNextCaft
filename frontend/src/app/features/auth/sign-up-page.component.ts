import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ClerkSignUpComponent } from 'ngx-clerk';
import { clerkConfig } from '../../../environments/clerk.config';

@Component({
  selector: 'app-sign-up-page',
  standalone: true,
  imports: [ClerkSignUpComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen items-center justify-center bg-background p-6">
      <clerk-sign-up
        [props]="{
          routing: 'path',
          path: signUpPath,
          signInUrl: signInPath,
          forceRedirectUrl: afterSignInUrl,
        }"
      />
    </div>
  `,
})
export class SignUpPageComponent {
  readonly signInPath = clerkConfig.signInUrl;
  readonly signUpPath = clerkConfig.signUpUrl;
  readonly afterSignInUrl = clerkConfig.afterSignInUrl;
}
