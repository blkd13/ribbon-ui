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
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { Subscription } from 'rxjs';
import { tap, debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { AdminScopeService } from '../../../services/admin-scope.service';
import {
    MemberManagementService,
    DivisionMemberForView,
    Division,
    MemberAssignmentRequest,
    MemberUpdateRequest
} from '../../../services/member-management.service';
import { User, UserRoleType, UserStatus } from '../../../models/models';
import { ScopeInfo, ScopeType } from '../../../services/model-manager.service';
import { MemberAssignmentDialogComponent } from './member-assignment-dialog/member-assignment-dialog.component';

// 複数ロール対応のためのインターフェース拡張
interface ExtendedDivisionMemberForView extends Omit<DivisionMemberForView, 'role'> {
    roles: UserRoleType[]; // 単一のroleから複数のrolesに変更
    role?: UserRoleType; // 後方互換性のため残す（deprecated）
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
        MatDialogModule,
        MatCheckboxModule,
        MatTooltipModule,
        MatChipsModule,
    ],
    templateUrl: './member-management.component.html',
    styleUrls: ['./member-management.component.scss']
})
export class MemberManagementComponent implements OnInit, OnDestroy {
    readonly memberService = inject(MemberManagementService);
    readonly adminScopeService = inject(AdminScopeService);
    readonly snackBar = inject(MatSnackBar);
    readonly dialog = inject(MatDialog);
    readonly fb = inject(FormBuilder);

    // Data - 複数ロール対応に変更
    members: ExtendedDivisionMemberForView[] = [];
    filteredMembers: ExtendedDivisionMemberForView[] = [];
    divisions: Division[] = [];
    selectedScope: ScopeInfo | null = null;

    // UI State
    isLoading = false;
    isFormVisible = false;
    selectedMembers = new Set<string>();
    selectedMember: ExtendedDivisionMemberForView | null = null;
    selectedDivision: Division | null = null;

    // Form state
    activeTab = 'basic';
    formType: 'member' | 'division' = 'member';
    isEditMode = false;
    form: FormGroup;
    divisionStats: any = null;

    // Forms and Controls
    searchControl = new FormControl('');
    filterForm: FormGroup;

    // Subscriptions
    private subscriptions = new Subscription();

    // Table columns
    displayedColumns: string[] = [
        'select',
        'user',
        'division',
        'roles', // roleからrolesに変更
        'assignedAt',
        'actions'
    ];

    // Enums for template
    readonly UserRoleType = UserRoleType;
    readonly availableRoles = this.memberService.getAvailableRoles();

    constructor() {
        this.filterForm = this.fb.group({
            divisionId: [''],
            role: [''],
            isActive: [true]
        });

        // Initialize main form for editing - divisionId削除、rolesに変更
        this.form = this.fb.group({
            name: ['', Validators.required],
            label: ['', Validators.required],
            description: [''],
            roles: [[], Validators.required], // 複数選択のため配列、必須
            isActive: [true]
        });
    }

    getRoleDisplayName(role: UserRoleType): string {
        return role;
    }

    ngOnInit(): void {
        this.setupSubscriptions();
        this.loadInitialData();
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

    private loadInitialData(): void {
        // Initial scope will be provided via selectedScope$ subscription
        // No need to manually get the scope here
    }

    private loadMembers(): void {
        if (!this.selectedScope) return;

        this.isLoading = true;

        // For division scope, load members of that specific division
        if (this.selectedScope.scopeType === ScopeType.DIVISION) {
            this.subscriptions.add(
                this.memberService.getMembers(this.selectedScope.scopeId).subscribe({
                    next: (members) => {
                        // Convert DivisionMember[] to ExtendedDivisionMemberForView[]
                        // 同じユーザーをグループ化して複数ロールを統合
                        const memberMap = new Map<string, ExtendedDivisionMemberForView>();

                        members.forEach(member => {
                            const key = member.userId;

                            if (memberMap.has(key)) {
                                // 既存のメンバーにロールを追加
                                const existingMember = memberMap.get(key)!;
                                if (!existingMember.roles.includes(member.role)) {
                                    existingMember.roles.push(member.role);
                                }
                            } else {
                                // 新しいメンバーエントリを作成
                                memberMap.set(key, {
                                    id: `${member.userId}_${this.selectedScope!.scopeId}`,
                                    user: {
                                        id: member.userId,
                                        name: member.userName,
                                        email: member.userEmail
                                    } as User,
                                    divisionId: this.selectedScope!.scopeId,
                                    divisionName: this.selectedScope!.scopeId,
                                    roles: [member.role], // 配列として初期化
                                    // role: member.role, // 後方互換性のため最初のロールを設定
                                    isActive: member.status === UserStatus.Active,
                                    userId: member.userId,
                                    // assignedAt: member.assignedAt || new Date(),
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
            // For organization scope, we'd need to load all divisions and their members
            // This would require additional API endpoints
            this.snackBar.open('組織レベルのメンバー管理は現在サポートされていません', 'Close', { duration: 3000 });
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

        // Filter by role - 複数ロールに対応
        if (filters.role) {
            filtered = filtered.filter(member => member.roles.includes(filters.role));
        }

        this.filteredMembers = filtered;
    }

    openAssignmentDialog(): void {
        if (!this.selectedScope) return;

        if (!this.canAssignMembers()) {
            this.snackBar.open('このディビジョンでメンバーを管理する権限がありません', 'Close', { duration: 3000 });
            return;
        }

        const dialogRef = this.dialog.open(MemberAssignmentDialogComponent, {
            width: '600px',
            data: {
                scopeInfo: this.selectedScope,
                divisions: this.divisions
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.loadMembers();
            }
        });
    }

    updateMemberRole(member: ExtendedDivisionMemberForView, newRoles: UserRoleType[]): void {
        if (!this.canManageUserRoles()) {
            this.snackBar.open('ユーザーロールを管理する権限がありません', 'Close', { duration: 3000 });
            return;
        }

        // 複数ロールの更新に対応
        // 実際のAPIに応じて実装を調整する必要があります
        const request: MemberUpdateRequest = { role: newRoles[0] }; // 暫定的に最初のロールを使用

        this.subscriptions.add(
            this.memberService.updateMember(member.divisionId, member.userId, request).subscribe({
                next: () => {
                    this.snackBar.open('メンバーのロールを更新しました', 'Close', { duration: 3000 });
                    this.loadMembers();
                },
                error: (error) => {
                    console.error('Error updating member role:', error);
                    this.snackBar.open('ロールの更新に失敗しました', 'Close', { duration: 3000 });
                }
            })
        );
    }

    removeMember(member: ExtendedDivisionMemberForView): void {
        if (!this.canRemoveMember(member)) {
            this.snackBar.open('このメンバーを削除する権限がありません', 'Close', { duration: 3000 });
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

    bulkRemoveMembers(): void {
        if (this.selectedMembers.size === 0) return;

        if (!this.canManageUserRoles()) {
            this.snackBar.open('ユーザーロールを管理する権限がありません', 'Close', { duration: 3000 });
            return;
        }

        const selectedCount = this.selectedMembers.size;
        if (!confirm(`選択した ${selectedCount} 人のメンバーを削除しますか？`)) {
            return;
        }

        // Get member data for the selected IDs to extract divisionId and userId
        const membersToRemove = this.filteredMembers.filter(member =>
            this.selectedMembers.has(member.id)
        );

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

    refresh(): void {
        this.loadMembers();
        this.loadDivisions();
    }

    // Form methods
    selectMember(member: ExtendedDivisionMemberForView): void {
        this.selectedMember = member;
        this.selectedDivision = null;
        this.formType = 'member';
        this.isEditMode = true;
        this.activeTab = 'basic';
        this.isFormVisible = true;

        // Populate form with member data - rolesを使用
        this.form.patchValue({
            roles: member.roles,
            isActive: member.isActive
        });
    }

    createDivision(): void {
        if (!this.canCreateDivision()) {
            this.snackBar.open('ディビジョンを作成する権限がありません', 'Close', { duration: 3000 });
            return;
        }

        this.selectedMember = null;
        this.selectedDivision = null;
        this.formType = 'division';
        this.isEditMode = false;
        this.activeTab = 'basic';
        this.isFormVisible = true;

        // Reset form for new division
        this.form.reset({
            name: '',
            label: '',
            description: '',
            isActive: true,
            roles: [] // 空配列で初期化
        });
    }

    closeForm(): void {
        this.isFormVisible = false;
        this.selectedMember = null;
        this.selectedDivision = null;
        this.form.reset();
    }

    setActiveTab(tab: string): void {
        this.activeTab = tab;
    }

    getFormTitle(): string {
        if (this.formType === 'division') {
            return this.isEditMode ? 'Edit Division' : 'Create Division';
        } else {
            return this.isEditMode ? 'Edit Member' : 'Add Member';
        }
    }

    submitForm(): void {
        if (this.form.invalid) return;

        if (this.formType === 'division') {
            this.submitDivisionForm();
        } else {
            this.submitMemberForm();
        }
    }

    private submitDivisionForm(): void {
        const formValue = this.form.value;

        if (this.isEditMode && this.selectedDivision) {
            // Update division
            if (!this.canUpdateDivision()) {
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
        } else {
            // Create new division
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
    }

    private submitMemberForm(): void {
        if (!this.selectedMember) return;

        if (!this.canManageUserRoles()) {
            this.snackBar.open('ユーザーロールを管理する権限がありません', 'Close', { duration: 3000 });
            return;
        }

        const formValue = this.form.value;
        const selectedRoles: UserRoleType[] = formValue.roles;

        // 複数ロールの更新 - 実際のAPIに応じて調整が必要
        // ここでは最初のロールを使用（暫定的）
        const updateRequest = {
            role: selectedRoles[0] || UserRoleType.User,
            isActive: formValue.isActive
        };

        this.subscriptions.add(
            this.memberService.updateMember(this.selectedMember.divisionId, this.selectedMember.user.id, updateRequest).subscribe({
                next: () => {
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

    hasError(field: string): boolean {
        const control = this.form.get(field);
        return !!(control && control.invalid && (control.dirty || control.touched));
    }

    getErrorMessage(field: string): string {
        const control = this.form.get(field);
        if (control?.errors) {
            if (control.errors['required']) {
                return `${field} is required`;
            }
        }
        return '';
    }

    canEditMember(member: ExtendedDivisionMemberForView): boolean {
        // Check permissions based on current user scope and role
        if (!this.selectedScope) return false;

        return this.adminScopeService.canEditScope(
            this.selectedScope.scopeType,
            this.selectedScope.scopeId
        );
    }

    canManageUserRoles(): boolean {
        if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
            return false;
        }
        return this.adminScopeService.canManageUserRoles(this.selectedScope.scopeId);
    }

    canCreateDivision(): boolean {
        return this.adminScopeService.canCreateDivision();
    }

    canUpdateDivision(): boolean {
        if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
            return false;
        }
        return this.adminScopeService.canEditScope(ScopeType.DIVISION, this.selectedScope.scopeId);
    }

    canRemoveMember(member: ExtendedDivisionMemberForView): boolean {
        if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
            return false;
        }
        return this.adminScopeService.canManageUserRoles(this.selectedScope.scopeId);
    }

    canAssignMembers(): boolean {
        if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
            return false;
        }
        return this.adminScopeService.canManageUserRoles(this.selectedScope.scopeId);
    }
}