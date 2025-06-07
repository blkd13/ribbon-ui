import { Component, Inject, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { Observable, of, Subscription } from 'rxjs';
import { startWith, map } from 'rxjs/operators';

import {
    MemberManagementService,
    Division,
    MemberAssignmentRequest,
    UserName
} from '../../../../services/member-management.service';
import { UserRoleType } from '../../../../models/models';
import { ScopeInfo, ScopeType } from '../../../../services/model-manager.service';
import { AuthService } from '../../../../services/auth.service';
import { AdminScopeService } from '../../../../services/admin-scope.service';

export interface MemberAssignmentDialogData {
    scopeInfo: ScopeInfo;
    divisions: Division[];
    currentDivisionId?: string; // 現在選択されているDivision ID
}

@Component({
    selector: 'app-member-assignment-dialog',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatDialogModule,
        MatButtonModule,
        MatFormFieldModule,
        MatSelectModule,
        MatInputModule,
        MatSnackBarModule,
        MatAutocompleteModule,
        MatIconModule,
    ],
    templateUrl: './member-assignment-dialog.component.html',
    styleUrls: ['./member-assignment-dialog.component.scss']
})
export class MemberAssignmentDialogComponent implements OnInit, OnDestroy {
    private readonly fb = inject(FormBuilder);
    private readonly memberService = inject(MemberManagementService);
    private readonly authService = inject(AuthService);
    private readonly snackBar = inject(MatSnackBar);
    private readonly adminScopeService = inject(AdminScopeService);

    UserRoleType = UserRoleType;
    assignmentForm: FormGroup;
    availableUsers: UserName[] = [];
    filteredUsers: Observable<UserName[]> = of([]);
    isLoading = false;

    // Subscriptions
    private subscriptions = new Subscription();

    // Selected scope from admin
    selectedScope: ScopeInfo | null = null;

    // Available roles for the current scope
    readonly availableRoles = this.memberService.getAvailableRoles();

    constructor(
        public dialogRef: MatDialogRef<MemberAssignmentDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: MemberAssignmentDialogData,
    ) {
        this.assignmentForm = this.fb.group({
            selectedUser: [null, Validators.required],
            role: [UserRoleType.Member, Validators.required]
        });
    }

    ngOnInit(): void {
        this.loadAvailableUsers();
        this.setupUserFilter();
    }

    ngOnDestroy(): void {
        this.subscriptions.unsubscribe();
    }

    private loadAvailableUsers(): void {
        // Load users from the organization that are not already assigned

        // Subscribe to selected scope changes
        const scopeSubscription = this.adminScopeService.selectedScope$.subscribe(scope => {
            this.selectedScope = scope;
        });
        this.subscriptions.add(scopeSubscription);

        // Load available users
        this.memberService.getAvailableUsers().subscribe({
            next: (users) => {
                this.availableUsers = users;
            },
            error: (error) => {
                console.error('Error loading users:', error);
                this.snackBar.open('ユーザーの読み込みに失敗しました', 'Close', { duration: 3000 });
            }
        });
    }

    private setupUserFilter(): void {
        this.filteredUsers = this.assignmentForm.get('selectedUser')!.valueChanges.pipe(
            startWith(''),
            map(value => this._filterUsers(value || ''))
        );
    }

    private _filterUsers(value: string | UserName): UserName[] {
        // value がユーザーオブジェクトの場合は検索文字列として扱わない
        if (typeof value === 'object' && value !== null) {
            return this.availableUsers;
        }

        const filterValue = (value as string).toLowerCase();
        return this.availableUsers.filter(user =>
            user.email.toLowerCase().includes(filterValue) ||
            user.name.toLowerCase().includes(filterValue)
        );
    }

    onUserSelected(user: UserName): void {
        this.assignmentForm.patchValue({
            selectedUser: user
        });
    }

    displayUser(user: UserName): string {
        return user ? `${user.name} (${user.email})` : '';
    }

    onSubmit(): void {
        if (!this.assignmentForm.valid) {
            // Mark all fields as touched to show validation errors
            Object.keys(this.assignmentForm.controls).forEach(key => {
                this.assignmentForm.get(key)?.markAsTouched();
            });
            return;
        }

        const formValue = this.assignmentForm.value;
        const selectedUser = formValue.selectedUser;

        if (!selectedUser) {
            this.snackBar.open('ユーザーを選択してください', 'Close', { duration: 3000 });
            return;
        }

        this.isLoading = true;

        const request: MemberAssignmentRequest = {
            userId: selectedUser.id,
            role: formValue.role
        };

        this.memberService.assignMember(this.selectedScope!.scopeId, request).subscribe({
            next: () => {
                this.snackBar.open('メンバーを正常に割り当てました', 'Close', { duration: 3000 });
                this.dialogRef.close(true);
            },
            error: (error) => {
                console.error('Error assigning member:', error);
                this.snackBar.open('メンバーの割り当てに失敗しました', 'Close', { duration: 3000 });
                this.isLoading = false;
            }
        });
    }

    onCancel(): void {
        this.dialogRef.close(false);
    }

    getRoleDisplayName(role: UserRoleType.User | UserRoleType.Admin): string {
        const roleNames: Record<UserRoleType.User | UserRoleType.Admin, string> = {
            [UserRoleType.User]: 'ユーザー',
            [UserRoleType.Admin]: '管理者',
            // [UserRoleType.Maintainer]: 'メンテナー',
            // [UserRoleType.Member]: 'メンバー',
            // [UserRoleType.Viewer]: '閲覧者',
            // [UserRoleType.Guest]: 'ゲスト',
            // [UserRoleType.Owner]: 'オーナー',
            // [UserRoleType.BizAdmin]: 'ビジネス管理者',
            // [UserRoleType.SysAdmin]: 'システム管理者'
        };
        return roleNames[role] || role;
    }
}