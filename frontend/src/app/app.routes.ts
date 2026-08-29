import { Routes } from '@angular/router';
import { catchAllRoute } from 'ngx-clerk';
import { authGuard } from './core/permissions/auth.guard';
import { workspaceGuard } from './core/permissions/workspace.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/landing/landing-page.component').then((m) => m.LandingPageComponent),
  },
  {
    matcher: catchAllRoute('sign-in'),
    loadComponent: () =>
      import('./features/auth/sign-in-page.component').then((m) => m.SignInPageComponent),
  },
  {
    matcher: catchAllRoute('sign-up'),
    loadComponent: () =>
      import('./features/auth/sign-up-page.component').then((m) => m.SignUpPageComponent),
  },
  {
    path: 'select-workspace',
    loadComponent: () =>
      import('./features/workspace-select/workspace-select-page.component').then(
        (m) => m.WorkspaceSelectPageComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'app',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page.component').then(
            (m) => m.DashboardPageComponent,
          ),
      },
      {
        path: 'cameras',
        loadComponent: () =>
          import('./features/cameras/cameras-page.component').then((m) => m.CamerasPageComponent),
      },
      {
        path: 'cameras/:id',
        loadComponent: () =>
          import('./features/cameras/camera-detail-page.component').then(
            (m) => m.CameraDetailPageComponent,
          ),
      },
      {
        path: 'incidents',
        loadComponent: () =>
          import('./features/incidents/incidents-page.component').then(
            (m) => m.IncidentsPageComponent,
          ),
      },
      {
        path: 'incidents/:id',
        loadComponent: () =>
          import('./features/incidents/incident-detail-page.component').then(
            (m) => m.IncidentDetailPageComponent,
          ),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./features/analytics/analytics-page.component').then(
            (m) => m.AnalyticsPageComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
