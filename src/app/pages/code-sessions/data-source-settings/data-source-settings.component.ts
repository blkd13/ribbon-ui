import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { CodeSessionDataSource, DataSourceType, PathValidationResult } from '../../../models/code-session-models';
import { CodeSessionService } from '../../../services/code-session.service';
import { RelativeTimePipe } from '../../../pipe/relative-time.pipe';

@Component({
    selector: 'app-data-source-settings',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatSlideToggleModule,
        MatProgressSpinnerModule,
        MatSnackBarModule,
        MatDialogModule,
        MatTooltipModule,
        RelativeTimePipe,
    ],
    templateUrl: './data-source-settings.component.html',
    styleUrls: ['./data-source-settings.component.scss']
})
export class DataSourceSettingsComponent implements OnInit {
    dataSources: CodeSessionDataSource[] = [];
    loading = true;
    saving = false;
    validating = false;

    // Form state
    isEditing = false;
    editingId: string | null = null;
    form!: FormGroup;
    validationResult: PathValidationResult | null = null;

    dataSourceTypes: { value: DataSourceType; label: string; icon: string }[] = [
        { value: 'claude-code', label: 'Claude Code', icon: 'smart_toy' },
        { value: 'gemini-cli', label: 'Gemini CLI', icon: 'auto_awesome' },
        { value: 'codex-cli', label: 'Codex CLI', icon: 'code' },
    ];

    constructor(
        private router: Router,
        private fb: FormBuilder,
        private codeSessionService: CodeSessionService,
        private snackBar: MatSnackBar,
        private dialog: MatDialog
    ) {
        this.initForm();
    }

    ngOnInit(): void {
        this.loadDataSources();
    }

    private initForm(): void {
        this.form = this.fb.group({
            name: ['', [Validators.required, Validators.maxLength(100)]],
            type: ['claude-code' as DataSourceType, Validators.required],
            basePath: ['', [Validators.required, Validators.minLength(5)]],
            isActive: [true],
        });
    }

    loadDataSources(): void {
        this.loading = true;
        this.codeSessionService.getDataSources().subscribe({
            next: (dataSources) => {
                this.dataSources = dataSources;
                this.loading = false;
            },
            error: (error) => {
                console.error('Failed to load data sources:', error);
                this.snackBar.open('データソースの読み込みに失敗しました', '閉じる', { duration: 5000 });
                this.loading = false;
            }
        });
    }

    goBack(): void {
        this.router.navigate(['/code-sessions']);
    }

    // Form actions
    startCreate(): void {
        this.isEditing = true;
        this.editingId = null;
        this.form.reset({
            name: '',
            type: 'claude-code',
            basePath: '',
            isActive: true,
        });
        this.validationResult = null;
    }

    startEdit(dataSource: CodeSessionDataSource): void {
        this.isEditing = true;
        this.editingId = dataSource.id;
        this.form.patchValue({
            name: dataSource.name,
            type: dataSource.type,
            basePath: dataSource.basePath,
            isActive: dataSource.isActive,
        });
        this.validationResult = null;
    }

    cancelEdit(): void {
        this.isEditing = false;
        this.editingId = null;
        this.form.reset();
        this.validationResult = null;
    }

    validatePath(): void {
        const basePath = this.form.get('basePath')?.value;
        if (!basePath) {
            this.snackBar.open('パスを入力してください', '閉じる', { duration: 3000 });
            return;
        }

        this.validating = true;
        this.validationResult = null;

        this.codeSessionService.validatePath(basePath).subscribe({
            next: (result) => {
                this.validationResult = result;
                this.validating = false;
                if (result.valid) {
                    this.snackBar.open(`パスが有効です (${result.projectCount}プロジェクト検出)`, '閉じる', { duration: 3000 });
                } else {
                    this.snackBar.open(`パス検証エラー: ${result.error}`, '閉じる', { duration: 5000 });
                }
            },
            error: (error) => {
                console.error('Path validation failed:', error);
                this.validationResult = { valid: false, error: 'パス検証に失敗しました' };
                this.validating = false;
                this.snackBar.open('パス検証に失敗しました', '閉じる', { duration: 5000 });
            }
        });
    }

    saveDataSource(): void {
        if (this.form.invalid) {
            this.snackBar.open('入力内容を確認してください', '閉じる', { duration: 3000 });
            return;
        }

        this.saving = true;
        const formValue = this.form.value;

        const dataSource: Partial<CodeSessionDataSource> = {
            id: this.editingId || undefined,
            name: formValue.name,
            type: formValue.type,
            basePath: formValue.basePath,
            isActive: formValue.isActive,
        };

        this.codeSessionService.upsertDataSource(dataSource).subscribe({
            next: () => {
                this.snackBar.open(
                    this.editingId ? 'データソースを更新しました' : 'データソースを作成しました',
                    '閉じる',
                    { duration: 3000 }
                );
                this.cancelEdit();
                this.loadDataSources();
                this.saving = false;
            },
            error: (error) => {
                console.error('Failed to save data source:', error);
                this.snackBar.open('データソースの保存に失敗しました', '閉じる', { duration: 5000 });
                this.saving = false;
            }
        });
    }

    deleteDataSource(dataSource: CodeSessionDataSource): void {
        if (!confirm(`「${dataSource.name}」を削除してもよろしいですか？`)) {
            return;
        }

        this.codeSessionService.deleteDataSource(dataSource.id).subscribe({
            next: () => {
                this.snackBar.open('データソースを削除しました', '閉じる', { duration: 3000 });
                this.loadDataSources();
            },
            error: (error) => {
                console.error('Failed to delete data source:', error);
                this.snackBar.open('データソースの削除に失敗しました', '閉じる', { duration: 5000 });
            }
        });
    }

    toggleActive(dataSource: CodeSessionDataSource): void {
        const updated: Partial<CodeSessionDataSource> = {
            id: dataSource.id,
            isActive: !dataSource.isActive,
        };

        this.codeSessionService.upsertDataSource(updated).subscribe({
            next: () => {
                this.snackBar.open(
                    updated.isActive ? 'データソースを有効化しました' : 'データソースを無効化しました',
                    '閉じる',
                    { duration: 3000 }
                );
                this.loadDataSources();
            },
            error: (error) => {
                console.error('Failed to toggle data source:', error);
                this.snackBar.open('状態の変更に失敗しました', '閉じる', { duration: 5000 });
            }
        });
    }

    getTypeIcon(type: DataSourceType): string {
        return this.dataSourceTypes.find(t => t.value === type)?.icon || 'code';
    }

    getTypeLabel(type: DataSourceType): string {
        return this.dataSourceTypes.find(t => t.value === type)?.label || type;
    }

    getDefaultPath(type: DataSourceType): string {
        switch (type) {
            case 'claude-code':
                return '~/.claude/projects';
            case 'gemini-cli':
                return '~/.gemini/sessions';
            case 'codex-cli':
                return '~/.codex/sessions';
            default:
                return '';
        }
    }

    fillDefaultPath(): void {
        const type = this.form.get('type')?.value;
        if (type) {
            this.form.patchValue({ basePath: this.getDefaultPath(type) });
        }
    }
}
