// json-editor.component.ts
import { Component, Input, forwardRef, OnInit, OnDestroy, input } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  ReactiveFormsModule,
  Validators,
  ControlValueAccessor,
  NG_VALUE_ACCESSOR
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Observable, Subject, of } from 'rxjs';
import { map, startWith, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-json-editor',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatAutocompleteModule,
    MatInputModule,
    MatFormFieldModule
  ],
  templateUrl: './json-editor.component.html',
  styleUrls: ['./json-editor.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => JsonEditorComponent),
      multi: true,
    }
  ]
})
export class JsonEditorComponent implements OnInit, OnDestroy, ControlValueAccessor {

  readonly suggestions = input<string[]>([]);
  readonly label = input<string>('JSON Editor');
  readonly placeholder = input<string>('Enter key');

  form!: FormGroup;
  filteredOptions: { [key: string]: Observable<string[]> } = {};
  private destroy$ = new Subject<void>();
  private onChange: (value: Record<string, any>) => void = () => { };
  private onTouched: () => void = () => { };

  constructor(private fb: FormBuilder) { }

  ngOnInit() {
    this.initForm();

    // Subscribe to form value changes to call onChange
    this.form.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.onChange(this.getFormData());
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  initForm() {
    this.form = this.fb.group({
      items: this.fb.array([])
    });

    // Add initial empty item
    this.addItem();
  }

  // ControlValueAccessor implementation
  writeValue(value: Record<string, any> | null): void {
    if (!value) {
      this.resetForm();
      return;
    }

    this.updateFormFromRecord(value);
  }

  registerOnChange(fn: (value: Record<string, any>) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    isDisabled ? this.form.disable() : this.form.enable();
  }

  // Form management methods
  resetForm() {
    const itemsArray = this.form.get('items') as FormArray;
    while (itemsArray.length > 0) {
      itemsArray.removeAt(0);
    }
    this.addItem();
  }

  updateFormFromRecord(data: Record<string, any>) {
    const itemsArray = this.form.get('items') as FormArray;

    // Clear existing items
    while (itemsArray.length > 0) {
      itemsArray.removeAt(0);
    }

    // Add items from Record
    Object.entries(data).forEach(([key, value]) => {
      // Convert complex objects to string for display
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
      const itemGroup = this.createItem(key, displayValue);
      itemsArray.push(itemGroup);
      this.setupAutoComplete(itemsArray.length - 1);
    });

    // If no items were added, add an empty one
    if (itemsArray.length === 0) {
      this.addItem();
    }
  }

  get items() {
    return this.form.get('items') as FormArray;
  }

  createItem(key: string = '', value: any = '') {
    return this.fb.group({
      key: [key, Validators.required],
      value: [value, Validators.required]
    });
  }

  addItem() {
    const itemsArray = this.form.get('items') as FormArray;
    itemsArray.push(this.createItem());
    this.setupAutoComplete(itemsArray.length - 1);
    this.onTouched();
  }

  removeItem(index: number) {
    const itemsArray = this.form.get('items') as FormArray;
    itemsArray.removeAt(index);
    this.onTouched();
  }

  setupAutoComplete(index: number) {
    const itemGroup = (this.form.get('items') as FormArray).at(index) as FormGroup;
    const keyControl = itemGroup.get('key');

    this.filteredOptions[index] = keyControl!.valueChanges.pipe(
      startWith(''),
      map(value => this._filter(value || ''))
    );
  }

  private _filter(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.suggestions().filter(option => option.toLowerCase().includes(filterValue));
  }

  getFormData(): Record<string, any> {
    const result: Record<string, any> = {};

    (this.form.get('items') as FormArray).controls.forEach(control => {
      const key = (control as FormGroup).get('key')?.value;
      let value = (control as FormGroup).get('value')?.value;

      if (key && value !== undefined && key.trim() !== '') {
        // Try to parse the string value if it looks like JSON
        if (typeof value === 'string') {
          try {
            if (
              (value.startsWith('{') && value.endsWith('}')) ||
              (value.startsWith('[') && value.endsWith(']'))
            ) {
              value = JSON.parse(value);
            }
          } catch (e) {
            // If parsing fails, use the value as is
          }
        }

        result[key] = value;
      }
    });

    return result;
  }

  onInputBlur() {
    this.onTouched();
  }

  onOptionSelected(index: number, event: any) {
    const selectedKey = event.option.value;
    const itemGroup = (this.form.get('items') as FormArray).at(index) as FormGroup;
    itemGroup.get('key')?.setValue(selectedKey);
    this.onTouched();
  }
}