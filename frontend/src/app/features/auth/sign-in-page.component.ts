import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ClerkSignInComponent } from 'ngx-clerk';
import { clerkConfig } from '../../../environments/clerk.config';

@Component({
  selector: 'app-sign-in-page',
  standalone: true,
  imports: [ClerkSignInComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen items-center justify-center bg-background p-6">
      <clerk-sign-in
        [props]="{
          routing: 'path',
          path: signInPath,
          signUpUrl: signUpPath,
          forceRedirectUrl: afterSignInUrl,
        }"
      />
    </div>
  `,
})
export class SignInPageComponent {
  readonly signInPath = clerkConfig.signInUrl;
  readonly signUpPath = clerkConfig.signUpUrl;
  readonly afterSignInUrl = clerkConfig.afterSignInUrl;
}
