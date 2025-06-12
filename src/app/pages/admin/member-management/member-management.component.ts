import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Observable, of, Subscription } from 'rxjs';
import { tap, debounceTime, distinctUntilChanged, startWith, map } from 'rxjs/operators';

import { AdminScopeService } from '../../../services/admin-scope.service';
import {
    MemberManagementService,
    DivisionMemberForView,
    Division,
    MemberAssignmentRequest,
    MemberUpdateRequest,
    UserName
} from '../../../services/member-management.service';
import { User, UserRoleType, UserStatus } from '../../../models/models';
import { ScopeInfo, ScopeType } from '../../../services/model-manager.service';
import { UserRolePermissionService } from '../../../services/user-role-permission.service';
import { GService } from '../../../services/g.service';

// 型定義
interface DivisionFormData {
    name: string;
    label: string;
    description: string;
    isActive: boolean;
}

interface MemberFormData {
    roles: UserRoleType[];
    isActive: boolean;
}

interface MemberAddFormData {
    selectedUser: UserName | null;
    role: UserRoleType;
}

// 複数ロール対応のためのインターフェース拡張
interface ExtendedDivisionMemberForView extends Omit<DivisionMemberForView, 'role'> {
    roles: UserRoleType[];
    role?: UserRoleType;
}

@Component({
    selector: 'app-member-management',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatIconModule,
        MatButtonModule,
        MatSnackBarModule,
        MatFormFieldModule,
        MatSelectModule,
        MatInputModule,
        MatTableModule,
        MatCheckboxModule,
        MatTooltipModule,
        MatChipsModule,
        MatAutocompleteModule,
    ],
    templateUrl: './member-management.component.html',
    styleUrls: ['./member-management.component.scss']
})
export class MemberManagementComponent implements OnInit, OnDestroy {
    readonly memberService = inject(MemberManagementService);
    readonly adminScopeService = inject(AdminScopeService);
    readonly userRolePermissionService = inject(UserRolePermissionService);
    readonly g = inject(GService);
    readonly snackBar = inject(MatSnackBar);
    readonly fb = inject(FormBuilder);

    // Data
    members: ExtendedDivisionMemberForView[] = [];
    filteredMembers: ExtendedDivisionMemberForView[] = [];
    divisions: Division[] = [];
    availableUsers: UserName[] = [];
    filteredUsers: Observable<UserName[]> = of([]);
    selectedScope: ScopeInfo | null = null;

    // UI State
    isLoading = false;
    isFormVisible = false;
    selectedMembers = new Set<string>();
    selectedMember: ExtendedDivisionMemberForView | null = null;
    selectedDivision: Division | null = null;

    // Form state - 3種類のフォーム
    formType: 'member' | 'division' | 'member-add' = 'member';
    isEditMode = false;
    divisionStats: any = null;

    // 分離されたフォーム
    divisionForm: FormGroup<{
        name: FormControl<string>;
        label: FormControl<string>;
        description: FormControl<string>;
        isActive: FormControl<boolean>;
    }>;

    memberForm: FormGroup<{
        roles: FormControl<UserRoleType[]>;
        isActive: FormControl<boolean>;
    }>;

    memberAddForm: FormGroup<{
        selectedUser: FormControl<UserName | null>;
        role: FormControl<UserRoleType>;
    }>;

    // Search and Filter Forms
    searchControl = new FormControl('');
    filterForm: FormGroup;

    // Subscriptions
    private subscriptions = new Subscription();

    // Enums for template
    readonly UserRoleType = UserRoleType;
    // readonly availableRoles = this.memberService.getAvailableRoles();

    constructor() {
        this.filterForm = this.fb.group({
            divisionId: [''],
            role: [''],
            isActive: [true]
        });

        // Division Form - 明確なバリデーション
        this.divisionForm = this.fb.nonNullable.group({
            name: ['', [Validators.required, Validators.minLength(2)]],
            label: ['', [Validators.required, Validators.minLength(2)]],
            description: [''],
            isActive: [true]
        });

        // Member Form - ロール管理に特化
        this.memberForm = this.fb.nonNullable.group({
            roles: [[] as UserRoleType[], [Validators.required, Validators.minLength(1)]],
            isActive: [true]
        });

        // Member Add Form - 新規メンバー追加用
        this.memberAddForm = this.fb.nonNullable.group({
            selectedUser: [null as UserName | null, Validators.required],
            role: [UserRoleType.User, Validators.required]
        });
    }

    // Getter for current form based on formType
    get currentForm(): FormGroup {
        switch (this.formType) {
            case 'division': return this.divisionForm;
            case 'member-add': return this.memberAddForm;
            default: return this.memberForm;
        }
    }

    ngOnInit(): void {
        this.setupSubscriptions();
        this.loadInitialData();
        this.setupUserAutocomplete();
    }

    ngOnDestroy(): void {
        this.subscriptions.unsubscribe();
    }

    private setupSubscriptions(): void {
        // Admin scope selection subscription
        this.subscriptions.add(
            this.adminScopeService.selectedScope$.subscribe(scope => {
                this.selectedScope = scope;
                if (scope) {
                    this.loadMembers();
                    this.loadDivisions();
                    this.loadAvailableUsers();
                }
            })
        );

        // Search subscription
        this.subscriptions.add(
            this.searchControl.valueChanges.pipe(
                debounceTime(300),
                distinctUntilChanged()
            ).subscribe(() => this.filterMembers())
        );

        // Filter form subscription
        this.subscriptions.add(
            this.filterForm.valueChanges.subscribe(() => this.filterMembers())
        );
    }

    private setupUserAutocomplete(): void {
        this.filteredUsers = this.memberAddForm.get('selectedUser')!.valueChanges.pipe(
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

    displayUser(user: UserName): string {
        return user ? `${user.name} (${user.email})` : '';
    }

    onUserSelected(user: UserName): void {
        this.memberAddForm.patchValue({
            selectedUser: user
        });
    }

    private loadInitialData(): void {
        // Initial scope will be provided via selectedScope$ subscription
    }

    private loadAvailableUsers(): void {
        if (!this.selectedScope) return;

        this.subscriptions.add(
            this.memberService.getAvailableUsers().subscribe({
                next: (users) => {
                    this.availableUsers = users;
                },
                error: (error) => {
                    console.error('Error loading available users:', error);
                }
            })
        );
    }

    private loadMembers(): void {
        if (!this.selectedScope) return;

        this.isLoading = true;

        if (this.selectedScope.scopeType === ScopeType.DIVISION) {
            this.subscriptions.add(
                this.memberService.getMembers(this.selectedScope.scopeId).subscribe({
                    next: (members) => {
                        const memberMap = new Map<string, ExtendedDivisionMemberForView>();

                        members.forEach(member => {
                            const key = member.userId;

                            if (memberMap.has(key)) {
                                const existingMember = memberMap.get(key)!;
                                if (!existingMember.roles.includes(member.role)) {
                                    existingMember.roles.push(member.role);
                                }
                            } else {
                                memberMap.set(key, {
                                    id: `${member.userId}_${this.selectedScope!.scopeId}`,
                                    user: {
                                        id: member.userId,
                                        name: member.userName,
                                        email: member.userEmail
                                    } as User,
                                    divisionId: this.selectedScope!.scopeId,
                                    divisionName: this.selectedScope!.scopeId,
                                    roles: [member.role],
                                    isActive: member.status === UserStatus.Active,
                                    userId: member.userId,
                                    userName: member.userName,
                                    userEmail: member.userEmail,
                                    status: member.status
                                });
                            }
                        });

                        this.members = Array.from(memberMap.values());
                        this.filterMembers();
                        this.isLoading = false;
                    },
                    error: (error) => {
                        console.error('Error loading members:', error);
                        this.snackBar.open('メンバーの読み込みに失敗しました', 'Close', { duration: 3000 });
                        this.isLoading = false;
                    }
                })
            );
        } else {
            this.snackBar.open('組織レベルのメンバー管理は現在サポートされていません', 'Close', { duration: 3000 });
            this.isLoading = false;
        }
    }

    private loadDivisions(): void {
        if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.ORGANIZATION) return;

        this.subscriptions.add(
            this.memberService.getDivisions().subscribe({
                next: (divisions) => {
                    this.divisions = divisions;
                },
                error: (error) => {
                    console.error('Error loading divisions:', error);
                }
            })
        );
    }

    private filterMembers(): void {
        let filtered = [...this.members];
        const searchTerm = this.searchControl.value?.toLowerCase() || '';
        const filters = this.filterForm.value;

        // Text search
        if (searchTerm) {
            filtered = filtered.filter(member =>
                member.user.name.toLowerCase().includes(searchTerm) ||
                member.user.email.toLowerCase().includes(searchTerm)
            );
        }

        // Filter by division
        if (filters.divisionId) {
            filtered = filtered.filter(member => member.divisionId === filters.divisionId);
        }

        // Filter by role
        if (filters.role) {
            filtered = filtered.filter(member => member.roles.includes(filters.role));
        }

        this.filteredMembers = filtered;
    }

    // Form Management Methods
    // selectMember(member: ExtendedDivisionMemberForView): void {
    //     this.selectedMember = member;
    //     this.selectedDivision = null;
    //     this.formType = 'member';
    //     this.isEditMode = true;
    //     this.isFormVisible = true;

    //     this.memberForm.patchValue({
    //         roles: member.roles,
    //         isActive: member.isActive
    //     });
    // }

    createDivision(): void {
        if (!this.canCreateDivision()) {
            this.snackBar.open('ディビジョンを作成する権限がありません', 'Close', { duration: 3000 });
            return;
        }

        this.selectedMember = null;
        this.selectedDivision = null;
        this.formType = 'division';
        this.isEditMode = false;
        this.isFormVisible = true;

        this.divisionForm.reset({
            name: '',
            label: '',
            description: '',
            isActive: true
        });
    }

    editDivision(division: Division): void {
        if (!this.canUpdateDivision()) {
            this.snackBar.open('このディビジョンを編集する権限がありません', 'Close', { duration: 3000 });
            return;
        }

        this.selectedMember = null;
        this.selectedDivision = division;
        this.formType = 'division';
        this.isEditMode = true;
        this.isFormVisible = true;

        this.divisionForm.patchValue({
            name: division.name,
            label: division.label,
            description: division.description || '',
            isActive: division.isActive
        });
    }

    // 新しいメンバー追加メソッド - ダイアログの代わり
    // openAddMemberForm(): void {
    //     if (!this.selectedScope) return;

    //     if (!this.canAssignMembers()) {
    //         this.snackBar.open('このディビジョンでメンバーを管理する権限がありません', 'Close', { duration: 3000 });
    //         return;
    //     }

    //     this.selectedMember = null;
    //     this.selectedDivision = null;
    //     this.formType = 'member-add';
    //     this.isEditMode = false;
    //     this.isFormVisible = true;

    //     this.memberAddForm.reset({
    //         selectedUser: null,
    //         role: UserRoleType.User
    //     });
    // }

    closeForm(): void {
        this.isFormVisible = false;
        this.selectedMember = null;
        this.selectedDivision = null;
        this.divisionForm.reset();
        this.memberForm.reset();
        this.memberAddForm.reset();
    }

    getFormTitle(): string {
        switch (this.formType) {
            case 'division':
                return this.isEditMode ? 'Edit Division' : 'Create Division';
            case 'member-add':
                return 'Add Member';
            default:
                return 'Edit Member';
        }
    }

    // Submit Methods - フォーム別に分離
    submitForm(): void {
        switch (this.formType) {
            case 'division':
                this.submitDivisionForm();
                break;
            case 'member-add':
                this.submitMemberAddForm();
                break;
            default:
                this.submitMemberForm();
                break;
        }
    }

    submitDivisionForm(): void {
        if (this.divisionForm.invalid) {
            this.markFormGroupTouched(this.divisionForm);
            return;
        }

        const formValue = this.divisionForm.value as DivisionFormData;

        if (this.isEditMode && this.selectedDivision) {
            this.updateDivision(formValue);
        } else {
            this.createNewDivision(formValue);
        }
    }

    submitMemberForm(): void {
        if (this.memberForm.invalid) {
            this.markFormGroupTouched(this.memberForm);
            return;
        }

        if (!this.selectedMember) return;

        const formValue = this.memberForm.value as MemberFormData;
        this.updateMember(formValue);
    }

    submitMemberAddForm(): void {
        if (this.memberAddForm.invalid) {
            this.markFormGroupTouched(this.memberAddForm);
            return;
        }

        const formValue = this.memberAddForm.value as MemberAddFormData;

        if (!formValue.selectedUser) {
            this.snackBar.open('ユーザーを選択してください', 'Close', { duration: 3000 });
            return;
        }

        this.addMember(formValue);
    }

    // private addMember(formValue: MemberAddFormData): void {
    //     if (!this.selectedScope || !formValue.selectedUser) return;

    //     this.isLoading = true;

    //     const request: MemberAssignmentRequest = {
    //         userId: formValue.selectedUser.id,
    //         role: formValue.role
    //     };

    //     this.subscriptions.add(
    //         this.memberService.assignMember(this.selectedScope.scopeId, request).subscribe({
    //             next: () => {
    //                 this.snackBar.open('メンバーを正常に追加しました', 'Close', { duration: 3000 });
    //                 this.loadMembers();
    //                 this.closeForm();
    //                 this.isLoading = false;
    //             },
    //             error: (error) => {
    //                 console.error('Error adding member:', error);
    //                 this.snackBar.open('メンバーの追加に失敗しました', 'Close', { duration: 3000 });
    //                 this.isLoading = false;
    //             }
    //         })
    //     );
    // }

    private createNewDivision(formValue: DivisionFormData): void {
        if (!this.canCreateDivision()) {
            this.snackBar.open('ディビジョンを作成する権限がありません', 'Close', { duration: 3000 });
            return;
        }

        const createRequest = {
            name: formValue.name,
            label: formValue.label,
            description: formValue.description
        };

        this.subscriptions.add(
            this.memberService.createDivision(createRequest).subscribe({
                next: (division) => {
                    this.snackBar.open('Division created successfully', 'Close', { duration: 3000 });
                    this.loadDivisions();
                    this.closeForm();
                },
                error: (error) => {
                    console.error('Error creating division:', error);
                    this.snackBar.open('Failed to create division', 'Close', { duration: 3000 });
                }
            })
        );
    }

    private updateDivision(formValue: DivisionFormData): void {
        if (!this.selectedDivision || !this.canUpdateDivision()) {
            this.snackBar.open('このディビジョンを更新する権限がありません', 'Close', { duration: 3000 });
            return;
        }

        const updateRequest = {
            name: formValue.name,
            label: formValue.label,
            description: formValue.description,
            isActive: formValue.isActive
        };

        this.subscriptions.add(
            this.memberService.updateDivision(this.selectedDivision.id, updateRequest).subscribe({
                next: (division) => {
                    this.snackBar.open('Division updated successfully', 'Close', { duration: 3000 });
                    this.loadDivisions();
                    this.closeForm();
                },
                error: (error) => {
                    console.error('Error updating division:', error);
                    this.snackBar.open('Failed to update division', 'Close', { duration: 3000 });
                }
            })
        );
    }

    // private updateMember(formValue: MemberFormData): void {
    //     if (!this.selectedMember || !this.canManageUserRoles()) {
    //         this.snackBar.open('ユーザーロールを管理する権限がありません', 'Close', { duration: 3000 });
    //         return;
    //     }

    //     const updateRequest = {
    //         role: formValue.roles[0] || UserRoleType.User,
    //         isActive: formValue.isActive
    //     };

    //     this.subscriptions.add(
    //         this.memberService.updateMember(this.selectedMember.divisionId, this.selectedMember.user.id, updateRequest).subscribe({
    //             next: () => {
    //                 this.snackBar.open('Member updated successfully', 'Close', { duration: 3000 });
    //                 this.loadMembers();
    //                 this.closeForm();
    //             },
    //             error: (error) => {
    //                 console.error('Error updating member:', error);
    //                 this.snackBar.open('Failed to update member', 'Close', { duration: 3000 });
    //             }
    //         })
    //     );
    // }

    // Validation Helper Methods
    hasFormError(field: string): boolean {
        const control = this.currentForm.get(field);
        return !!(control && control.invalid && (control.dirty || control.touched));
    }

    getFormErrorMessage(field: string): string {
        const control = this.currentForm.get(field);
        if (control?.errors) {
            if (control.errors['required']) {
                return `${field} is required`;
            }
            if (control.errors['minlength']) {
                return `${field} must be at least ${control.errors['minlength'].requiredLength} characters`;
            }
        }
        return '';
    }

    private markFormGroupTouched(formGroup: FormGroup): void {
        Object.keys(formGroup.controls).forEach(key => {
            const control = formGroup.get(key);
            control?.markAsTouched();
        });
    }

    // 既存のメソッドは維持（削除されたダイアログ関連以外）
    // removeMember(member: ExtendedDivisionMemberForView): void {
    //     if (!this.canRemoveMember(member)) {
    //         this.snackBar.open('このメンバーを削除する権限がありません', 'Close', { duration: 3000 });
    //         return;
    //     }

    //     if (!confirm(`${member.user.name} をディビジョンから削除しますか？`)) {
    //         return;
    //     }

    //     this.subscriptions.add(
    //         this.memberService.removeMember(member.divisionId, member.userId).subscribe({
    //             next: () => {
    //                 this.snackBar.open('メンバーを削除しました', 'Close', { duration: 3000 });
    //                 this.loadMembers();
    //             },
    //             error: (error) => {
    //                 console.error('Error removing member:', error);
    //                 this.snackBar.open('メンバーの削除に失敗しました', 'Close', { duration: 3000 });
    //             }
    //         })
    //     );
    // }

    toggleMemberSelection(memberId: string): void {
        if (this.selectedMembers.has(memberId)) {
            this.selectedMembers.delete(memberId);
        } else {
            this.selectedMembers.add(memberId);
        }
    }

    isAllSelected(): boolean {
        return this.filteredMembers.length > 0 &&
            this.filteredMembers.every(member => this.selectedMembers.has(member.id));
    }

    isSomeSelected(): boolean {
        return this.selectedMembers.size > 0 && !this.isAllSelected();
    }

    toggleAllSelection(): void {
        if (this.isAllSelected()) {
            this.selectedMembers.clear();
        } else {
            this.filteredMembers.forEach(member => this.selectedMembers.add(member.id));
        }
    }

    // bulkRemoveMembers(): void {
    //     if (this.selectedMembers.size === 0) return;

    //     if (!this.canManageUserRoles()) {
    //         this.snackBar.open('ユーザーロールを管理する権限がありません', 'Close', { duration: 3000 });
    //         return;
    //     }

    //     const selectedCount = this.selectedMembers.size;
    //     if (!confirm(`選択した ${selectedCount} 人のメンバーを削除しますか？`)) {
    //         return;
    //     }

    //     const membersToRemove = this.filteredMembers.filter(member =>
    //         this.selectedMembers.has(member.id)
    //     );

    //     const removePromises = membersToRemove.map(member =>
    //         this.memberService.removeMember(member.divisionId, member.userId).toPromise()
    //     );

    //     Promise.all(removePromises).then(() => {
    //         this.snackBar.open(`${selectedCount} 人のメンバーを削除しました`, 'Close', { duration: 3000 });
    //         this.selectedMembers.clear();
    //         this.loadMembers();
    //     }).catch(error => {
    //         console.error('Error in bulk remove:', error);
    //         this.snackBar.open('一括削除に失敗しました', 'Close', { duration: 3000 });
    //     });
    // }

    refresh(): void {
        this.loadMembers();
        this.loadDivisions();
        this.loadAvailableUsers();
    }

    // Permission methods
    /**
     * メンバーを編集できるかチェック（ユーザーロール管理用）
     */
    canEditMember(member: ExtendedDivisionMemberForView): boolean {
        if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
            return false;
        }

        const userRoleContext = {
            userId: member.userId,
            divisionId: member.divisionId,
            currentRoles: member.roles,
            isActive: member.isActive
        };

        return this.userRolePermissionService.canEditUserRole(
            userRoleContext,
            this.selectedScope.scopeId
        );
    }

    /**
     * ユーザーロールを管理できるかチェック（ユーザーロール管理用）
     */
    canManageUserRoles(): boolean {
        if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
            return false;
        }
        return this.userRolePermissionService.canManageUserRoles(this.selectedScope.scopeId);
    }

    /**
     * Divisionを作成できるかチェック（ユーザーロール管理用）
     */
    canCreateDivision(): boolean {
        return this.userRolePermissionService.canCreateDivision();
    }

    /**
     * Divisionを更新できるかチェック（ユーザーロール管理用）
     */
    canUpdateDivision(): boolean {
        if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
            return false;
        }
        return this.userRolePermissionService.canUpdateDivision(this.selectedScope.scopeId);
    }

    /**
     * メンバーを削除できるかチェック（ユーザーロール管理用）
     */
    canRemoveMember(member: ExtendedDivisionMemberForView): boolean {
        if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
            return false;
        }

        const userRoleContext = {
            userId: member.userId,
            divisionId: member.divisionId,
            currentRoles: member.roles,
            isActive: member.isActive
        };

        return this.userRolePermissionService.canRemoveUserFromDivision(
            userRoleContext,
            this.selectedScope.scopeId
        );
    }

    /**
     * メンバーを割り当てできるかチェック（ユーザーロール管理用）
     */
    canAssignMembers(): boolean {
        if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
            return false;
        }
        return this.userRolePermissionService.canManageUserRoles(this.selectedScope.scopeId);
    }

    /**
     * 特定のロールを割り当てできるかチェック
     */
    canAssignRole(targetUserId: string | undefined, role: UserRoleType): boolean {
        if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
            return false;
        }
        return this.userRolePermissionService.canAssignRole(
            targetUserId || '',
            role,
            this.selectedScope.scopeId
        );
    }

    /**
     * 現在のスコープで割り当て可能なロール一覧を取得
     */
    getAssignableRoles(): UserRoleType[] {
        if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
            return [];
        }
        return this.userRolePermissionService.getAssignableRoles(this.selectedScope.scopeId);
    }

    // Member form methods の修正

    private addMember(formValue: MemberAddFormData): void {
        if (!this.selectedScope || !formValue.selectedUser) return;

        // 権限チェック: 選択されたロールを割り当てできるかチェック
        if (!this.canAssignRole(formValue.selectedUser.id, formValue.role)) {
            const errorMessage = this.userRolePermissionService.generatePermissionErrorMessage(
                'ロール割り当て',
                'role_not_assignable'
            );
            this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
            return;
        }

        this.isLoading = true;

        const request: MemberAssignmentRequest = {
            userId: formValue.selectedUser.id,
            role: formValue.role
        };

        this.subscriptions.add(
            this.memberService.assignMember(this.selectedScope.scopeId, request).subscribe({
                next: () => {
                    this.snackBar.open('メンバーを正常に追加しました', 'Close', { duration: 3000 });
                    this.loadMembers();
                    this.closeForm();
                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Error adding member:', error);
                    this.snackBar.open('メンバーの追加に失敗しました', 'Close', { duration: 3000 });
                    this.isLoading = false;
                }
            })
        );
    }

    private updateMember(formValue: MemberFormData): void {
        if (!this.selectedMember) return;

        // 自分自身のロール変更を防ぐ
        const userRoleContext = {
            userId: this.selectedMember.userId,
            divisionId: this.selectedMember.divisionId,
            currentRoles: this.selectedMember.roles,
            isActive: this.selectedMember.isActive
        };

        if (!this.userRolePermissionService.canEditUserRole(userRoleContext, this.selectedMember.divisionId)) {
            const errorMessage = this.userRolePermissionService.generatePermissionErrorMessage(
                'ロール編集',
                this.selectedMember.userId === this.getCurrentUserId() ? 'self_edit' : 'insufficient_authority'
            );
            this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
            return;
        }

        // 新しいロールを割り当てできるかチェック
        const newRole = formValue.roles[0] || UserRoleType.User;
        if (!this.canAssignRole(this.selectedMember.userId, newRole)) {
            const errorMessage = this.userRolePermissionService.generatePermissionErrorMessage(
                'ロール割り当て',
                'role_not_assignable'
            );
            this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
            return;
        }

        const updateRequest = {
            role: newRole,
            isActive: formValue.isActive
        };

        this.subscriptions.add(
            this.memberService.updateMember(this.selectedMember.divisionId, this.selectedMember.user.id, updateRequest).subscribe({
                next: () => {
                    // 権限変更ログのメタデータを生成
                    const logMetadata = this.userRolePermissionService.generateRoleChangeMetadata(
                        this.selectedMember!.userId,
                        this.selectedMember!.roles,
                        [newRole],
                        this.selectedMember!.divisionId
                    );
                    console.log('Role change logged:', logMetadata);

                    this.snackBar.open('Member updated successfully', 'Close', { duration: 3000 });
                    this.loadMembers();
                    this.closeForm();
                },
                error: (error) => {
                    console.error('Error updating member:', error);
                    this.snackBar.open('Failed to update member', 'Close', { duration: 3000 });
                }
            })
        );
    }

    removeMember(member: ExtendedDivisionMemberForView): void {
        if (!this.canRemoveMember(member)) {
            const errorMessage = this.userRolePermissionService.generatePermissionErrorMessage(
                'メンバー削除',
                member.userId === this.getCurrentUserId() ? 'self_edit' : 'insufficient_authority'
            );
            this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
            return;
        }

        if (!confirm(`${member.user.name} をディビジョンから削除しますか？`)) {
            return;
        }

        this.subscriptions.add(
            this.memberService.removeMember(member.divisionId, member.userId).subscribe({
                next: () => {
                    this.snackBar.open('メンバーを削除しました', 'Close', { duration: 3000 });
                    this.loadMembers();
                },
                error: (error) => {
                    console.error('Error removing member:', error);
                    this.snackBar.open('メンバーの削除に失敗しました', 'Close', { duration: 3000 });
                }
            })
        );
    }

    bulkRemoveMembers(): void {
        if (this.selectedMembers.size === 0) return;

        if (!this.canManageUserRoles()) {
            this.snackBar.open('ユーザーロールを管理する権限がありません', 'Close', { duration: 3000 });
            return;
        }

        // 選択されたメンバーの中に削除できないメンバーがいるかチェック
        const membersToRemove = this.filteredMembers.filter(member =>
            this.selectedMembers.has(member.id)
        );

        const unremovableMembers = membersToRemove.filter(member => !this.canRemoveMember(member));

        if (unremovableMembers.length > 0) {
            const selfInList = unremovableMembers.some(member => member.userId === this.getCurrentUserId());
            const errorMessage = selfInList
                ? '自分自身は削除対象に含めることができません'
                : '権限不足により削除できないメンバーが含まれています';
            this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
            return;
        }

        const selectedCount = this.selectedMembers.size;
        if (!confirm(`選択した ${selectedCount} 人のメンバーを削除しますか？`)) {
            return;
        }

        const removePromises = membersToRemove.map(member =>
            this.memberService.removeMember(member.divisionId, member.userId).toPromise()
        );

        Promise.all(removePromises).then(() => {
            this.snackBar.open(`${selectedCount} 人のメンバーを削除しました`, 'Close', { duration: 3000 });
            this.selectedMembers.clear();
            this.loadMembers();
        }).catch(error => {
            console.error('Error in bulk remove:', error);
            this.snackBar.open('一括削除に失敗しました', 'Close', { duration: 3000 });
        });
    }

    // Form setup methods の修正

    selectMember(member: ExtendedDivisionMemberForView): void {
        this.selectedMember = member;
        this.selectedDivision = null;
        this.formType = 'member';
        this.isEditMode = true;
        this.isFormVisible = true;

        // 割り当て可能なロールのリストを取得
        const assignableRoles = this.getAssignableRoles();

        // 現在のロールが割り当て可能ロールに含まれていない場合は、フォームを読み取り専用にする
        const hasEditableRoles = member.roles.some(role => assignableRoles.includes(role));

        this.memberForm.patchValue({
            roles: member.roles,
            isActive: member.isActive
        });

        // 編集権限がない場合はフォームを無効化
        if (!this.canEditMember(member)) {
            this.memberForm.disable();
        }
    }

    openAddMemberForm(): void {
        if (!this.selectedScope) return;

        if (!this.canAssignMembers()) {
            this.snackBar.open('このディビジョンでメンバーを管理する権限がありません', 'Close', { duration: 3000 });
            return;
        }

        this.selectedMember = null;
        this.selectedDivision = null;
        this.formType = 'member-add';
        this.isEditMode = false;
        this.isFormVisible = true;

        // 割り当て可能なロールのうち、デフォルトで最も権限の低いロールを設定
        const assignableRoles = this.getAssignableRoles();
        const defaultRole = assignableRoles.includes(UserRoleType.User)
            ? UserRoleType.User
            : assignableRoles[assignableRoles.length - 1] || UserRoleType.User;

        this.memberAddForm.reset({
            selectedUser: null,
            role: defaultRole
        });
    }

    /**
     * 現在のユーザーIDを取得するヘルパーメソッド
     */
    getCurrentUserId(): string {
        return this.g.info?.user?.id || '';
    }

    // 既存のメソッドで、availableRoles を動的に変更
    get availableRoles(): UserRoleType[] {
        // フォームタイプに応じて利用可能なロールを返す
        if (this.formType === 'member-add' || this.formType === 'member') {
            return this.getAssignableRoles();
        }
        // フォールバック
        return this.memberService.getAvailableRoles();
    }



    // canEditMember(member: ExtendedDivisionMemberForView): boolean {
    //     if (!this.selectedScope) return false;
    //     return this.adminScopeService.canEditScope(
    //         this.selectedScope.scopeType,
    //         this.selectedScope.scopeId
    //     );
    // }

    // canManageUserRoles(): boolean {
    //     if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
    //         return false;
    //     }
    //     return this.adminScopeService.canManageUserRoles(this.selectedScope.scopeId);
    // }

    // canCreateDivision(): boolean {
    //     return this.adminScopeService.canCreateDivision();
    // }

    // canUpdateDivision(): boolean {
    //     if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
    //         return false;
    //     }
    //     return this.adminScopeService.canEditScope(ScopeType.DIVISION, this.selectedScope.scopeId);
    // }

    // canRemoveMember(member: ExtendedDivisionMemberForView): boolean {
    //     if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
    //         return false;
    //     }
    //     return this.adminScopeService.canManageUserRoles(this.selectedScope.scopeId);
    // }

    // canAssignMembers(): boolean {
    //     if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
    //         return false;
    //     }
    //     return this.adminScopeService.canManageUserRoles(this.selectedScope.scopeId);
    // }
}