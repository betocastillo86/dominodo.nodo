import { Injectable } from '@angular/core';
import { NgbDatepickerI18n, NgbDateStruct } from '@ng-bootstrap/ng-bootstrap';

const WEEKDAYS_SHORT = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];
const WEEKDAYS_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Spanish labels for `ngb-datepicker`, which ships English ones. Provide it at
 * the component that hosts a datepicker:
 *
 *   providers: [{ provide: NgbDatepickerI18n, useClass: SpanishDatepickerI18n }]
 *
 * ng-bootstrap indexes weekdays ISO-style (1 = Monday … 7 = Sunday) and months
 * 1 = January … 12 = December.
 */
@Injectable()
export class SpanishDatepickerI18n extends NgbDatepickerI18n {
  getWeekdayLabel(weekday: number, width?: Intl.DateTimeFormatOptions['weekday']): string {
    const labels = width === 'long' ? WEEKDAYS_LONG : WEEKDAYS_SHORT;
    return labels[weekday - 1] ?? '';
  }

  getMonthShortName(month: number): string {
    return MONTHS_SHORT[month - 1] ?? '';
  }

  getMonthFullName(month: number): string {
    return MONTHS_LONG[month - 1] ?? '';
  }

  getDayAriaLabel(date: NgbDateStruct): string {
    return `${date.day} de ${this.getMonthFullName(date.month)} de ${date.year}`;
  }
}
