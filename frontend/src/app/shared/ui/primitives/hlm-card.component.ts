import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'hlm-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: {
    class: 'sentra-panel flex flex-col gap-4 p-4',
  },
})
export class HlmCardComponent {}

@Component({
  selector: 'hlm-card-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: {
    class: 'flex flex-col gap-1.5',
  },
})
export class HlmCardHeaderComponent {}

@Component({
  selector: 'hlm-card-title',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: {
    class: 'font-display text-lg font-semibold leading-none tracking-tight text-card-foreground',
  },
})
export class HlmCardTitleComponent {}

@Component({
  selector: 'hlm-card-description',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: {
    class: 'text-sm text-muted-foreground',
  },
})
export class HlmCardDescriptionComponent {}

@Component({
  selector: 'hlm-card-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: {
    class: 'text-sm text-card-foreground',
  },
})
export class HlmCardContentComponent {}

@Component({
  selector: 'hlm-card-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: {
    class: 'flex items-center gap-2 pt-2',
  },
})
export class HlmCardFooterComponent {}
