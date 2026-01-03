/**
 * Member Management - Refactored Version
 *
 * AdminListPageComponent を使用して共通化
 */
import { Component, inject, OnInit, OnDestroy, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, of, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, startWith } from 'rxjs/operators';

import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminListPageComponent } from '../../../parts/admin-list-page/admin-list-page.component';
import {
  AdminColumnDef,
  AdminFilterDef,
  AdminHeaderAction,
  AdminBulkAction,
  AdminRowAction,
  AdminFilterValues,
  AdminSortState,
  AdminActionEvent,
} from '../../../parts/admin-list-page/admin-list-page.types';

import { User, UserRoleType, UserStatus } from '../../../models/models';
import { AdminScopeService } from '../../../services/admin-scope.service';
import { GService } from '../../../services/g.service';
import { LoggerService } from '../../../services/logger';
import {
  Division,
  DivisionMemberForView,
  MemberAssignmentRequest,
  MemberManagementService,
  UserName
} from '../../../services/member-management.service';
import { ScopeInfo, ScopeType } from '../../../services/model-manager.service';
import { UserRolePermissionService } from '../../../services/user-role-permission.service';

// Type definitions
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
    MatAutocompleteModule,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
    TranslateModule,
    AdminListPageComponent,
  ],
  templateUrl: './member-management.component.html',
  styleUrls: ['./member-management.component.scss']
})
export class MemberManagementComponent implements OnInit, OnDestroy {
  // ========== Services ==========
  readonly memberService = inject(MemberManagementService);
  readonly adminScopeService = inject(AdminScopeService);
  readonly userRolePermissionService = inject(UserRolePermissionService);
  readonly g = inject(GService);
  readonly snackBar = inject(MatSnackBar);
  readonly fb = inject(FormBuilder);
  readonly translate = inject(TranslateService);
  readonly logger = inject(LoggerService);

  // ========== Template References ==========
  @ViewChild('headerExtra', { static: true }) headerExtraTemplate!: TemplateRef<any>;
  @ViewChild('formPanel', { static: true }) formPanelTemplate!: TemplateRef<any>;

  // ========== Data ==========
  members: ExtendedDivisionMemberForView[] = [];
  filteredMembers: ExtendedDivisionMemberForView[] = [];
  divisions: Division[] = [];
  availableUsers: UserName[] = [];
  filteredUsers: Observable<UserName[]> = of([]);
  selectedScope: ScopeInfo | null = null;

  // ========== UI State ==========
  isLoading = false;
  isFormVisible = false;
  selectedIds = new Set<string>();
  selectedMember: ExtendedDivisionMemberForView | null = null;
  selectedDivision: Division | null = null;

  // ========== Form State ==========
  formType: 'member' | 'division' | 'member-add' = 'member';
  isEditMode = false;
  divisionStats: any = null;

  // ========== Forms ==========
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

  // ========== Subscriptions ==========
  private subscriptions = new Subscription();

  // ========== Enums for Template ==========
  readonly UserRoleType = UserRoleType;

  // ========== Admin List Page Config ==========
  columns: AdminColumnDef<ExtendedDivisionMemberForView>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (item) => item.user.name,
      subLabel: 'User ID',
      renderSub: (item) => item.user.id,
    },
    {
      key: 'email',
      label: 'Email',
      sortable: true,
      render: (item) => item.user.email,
    },
    {
      key: 'roles',
      label: 'Roles',
      sortable: false,
      render: (item) => item.roles.join(', '),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (item) => item.isActive ? 'Active' : 'Inactive',
    },
  ];

  filters: AdminFilterDef[] = [
    { key: 'search', label: 'Search', type: 'text', placeholder: 'Search by name or email' },
    { key: 'role', label: 'Role', type: 'select', options: [] },
  ];

  filterValues: AdminFilterValues = { search: '', role: '' };
  sortState: AdminSortState = { column: null, direction: 'desc' };

  headerActions: AdminHeaderAction[] = [];
  bulkActions: AdminBulkAction[] = [];
  rowActions: AdminRowAction<ExtendedDivisionMemberForView>[] = [];

  constructor() {
    // Division Form
    this.divisionForm = this.fb.nonNullable.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      label: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      isActive: [true]
    });

    // Member Form
    this.memberForm = this.fb.nonNullable.group({
      roles: [[] as UserRoleType[], [Validators.required, Validators.minLength(1)]],
      isActive: [true]
    });

    // Member Add Form
    this.memberAddForm = this.fb.nonNullable.group({
      selectedUser: [null as UserName | null, Validators.required],
      role: [UserRoleType.User, Validators.required]
    });
  }

  ngOnInit(): void {
    this.setupAdminListConfig();
    this.setupSubscriptions();
    this.setupUserAutocomplete();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ========== Admin List Page Setup ==========
  private setupAdminListConfig(): void {
    // Role options for filter
    this.filters = [
      { key: 'search', label: 'Search', type: 'text', placeholder: 'Search by name or email' },
      {
        key: 'role',
        label: 'Role',
        type: 'select',
        options: [
          { value: '', label: 'All Roles' },
          ...this.memberService.getAvailableRoles().map(role => ({ value: role, label: role }))
        ]
      },
    ];

    // Header actions
    this.headerActions = [
      {
        id: 'create-division',
        label: 'Create Division',
        icon: 'domain',
        color: '',
        disabled: () => !this.canCreateDivision(),
        tooltip: () => !this.canCreateDivision() ? 'No permission to create division' : '',
      },
      {
        id: 'add-member',
        label: 'Add Member',
        icon: 'person_add',
        color: 'primary',
        disabled: () => !this.selectedScope || !this.canAssignMembers(),
        tooltip: () => !this.canAssignMembers() ? 'No permission to add members' : '',
      },
    ];

    // Bulk actions
    this.bulkActions = [
      {
        id: 'bulk-delete',
        label: 'Bulk Remove',
        icon: 'delete',
        color: 'warn',
        disabled: () => !this.canManageUserRoles(),
      },
    ];

    // Row actions
    this.rowActions = [
      {
        id: 'edit',
        icon: 'edit',
        tooltip: (item) => this.canEditMember(item) ? 'Edit' : (item.userId === this.getCurrentUserId() ? 'Cannot edit own role' : 'No permission'),
        disabled: (item) => !this.canEditMember(item),
      },
      {
        id: 'delete',
        icon: 'delete',
        color: 'warn',
        tooltip: (item) => this.canRemoveMember(item) ? 'Remove' : (item.userId === this.getCurrentUserId() ? 'Cannot delete self' : 'No permission'),
        disabled: (item) => !this.canRemoveMember(item),
      },
    ];
  }

  private setupSubscriptions(): void {
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
  }

  private setupUserAutocomplete(): void {
    this.filteredUsers = this.memberAddForm.get('selectedUser')!.valueChanges.pipe(
      startWith(''),
      map(value => this._filterUsers(value || ''))
    );
  }

  private _filterUsers(value: string | UserName): UserName[] {
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
    this.memberAddForm.patchValue({ selectedUser: user });
  }

  // ========== Data Loading ==========
  private loadAvailableUsers(): void {
    if (!this.selectedScope) return;

    this.subscriptions.add(
      this.memberService.getAvailableUsers().subscribe({
        next: (users) => {
          this.availableUsers = users;
        },
        error: (error) => {
          this.logger.error('Error loading available users:', error);
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
            this.applyFilters();
            this.isLoading = false;
          },
          error: (error) => {
            this.logger.error('Error loading members:', error);
            this.snackBar.open('Failed to load members', 'Close', { duration: 3000 });
            this.isLoading = false;
          }
        })
      );
    } else {
      this.snackBar.open('Organization-level member management is not supported', 'Close', { duration: 3000 });
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
          this.logger.error('Error loading divisions:', error);
        }
      })
    );
  }

  private applyFilters(): void {
    let filtered = [...this.members];
    const searchTerm = (this.filterValues['search'] || '').toLowerCase();
    const roleFilter = this.filterValues['role'] || '';

    if (searchTerm) {
      filtered = filtered.filter(member =>
        member.user.name.toLowerCase().includes(searchTerm) ||
        member.user.email.toLowerCase().includes(searchTerm)
      );
    }

    if (roleFilter) {
      filtered = filtered.filter(member => member.roles.includes(roleFilter as UserRoleType));
    }

    // Apply sorting
    if (this.sortState.column && this.sortState.direction) {
      filtered = this.sortMembers(filtered);
    }

    this.filteredMembers = filtered;
  }

  private sortMembers(members: ExtendedDivisionMemberForView[]): ExtendedDivisionMemberForView[] {
    const { column, direction } = this.sortState;
    if (!column || !direction) return members;

    return [...members].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (column) {
        case 'name':
          aVal = a.user.name.toLowerCase();
          bVal = b.user.name.toLowerCase();
          break;
        case 'email':
          aVal = a.user.email.toLowerCase();
          bVal = b.user.email.toLowerCase();
          break;
        case 'status':
          aVal = a.isActive ? 1 : 0;
          bVal = b.isActive ? 1 : 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // ========== Admin List Page Event Handlers ==========
  onFilterChange(values: AdminFilterValues): void {
    this.filterValues = values;
    this.applyFilters();
  }

  onSortChange(sortState: AdminSortState): void {
    this.sortState = sortState;
    this.applyFilters();
  }

  onItemSelect(item: ExtendedDivisionMemberForView): void {
    this.selectMember(item);
  }

  onSelectionChange(ids: Set<string>): void {
    this.selectedIds = ids;
  }

  onActionClick(event: AdminActionEvent<ExtendedDivisionMemberForView>): void {
    switch (event.actionId) {
      // Header actions
      case 'create-division':
        this.createDivision();
        break;
      case 'add-member':
        this.openAddMemberForm();
        break;

      // Row actions
      case 'edit':
        if (event.item) this.selectMember(event.item);
        break;
      case 'delete':
        if (event.item) this.removeMember(event.item);
        break;

      // Bulk actions
      case 'bulk-delete':
        this.bulkRemoveMembers();
        break;
    }
  }

  // ========== Tracking ==========
  trackByMember(item: ExtendedDivisionMemberForView): string {
    return item.id;
  }

  getRowClass(item: ExtendedDivisionMemberForView): string {
    const classes: string[] = [];
    if (item.userId === this.getCurrentUserId()) {
      classes.push('self-member');
    }
    return classes.join(' ');
  }

  // ========== Form Management ==========
  get currentForm(): FormGroup {
    switch (this.formType) {
      case 'division': return this.divisionForm;
      case 'member-add': return this.memberAddForm;
      default: return this.memberForm;
    }
  }

  selectMember(member: ExtendedDivisionMemberForView): void {
    this.selectedMember = member;
    this.selectedDivision = null;
    this.formType = 'member';
    this.isEditMode = true;
    this.isFormVisible = true;

    this.memberForm.patchValue({
      roles: member.roles,
      isActive: member.isActive
    });

    if (!this.canEditMember(member)) {
      this.memberForm.disable();
    } else {
      this.memberForm.enable();
    }
  }

  createDivision(): void {
    if (!this.canCreateDivision()) {
      this.snackBar.open('No permission to create division', 'Close', { duration: 3000 });
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
      this.snackBar.open('No permission to edit division', 'Close', { duration: 3000 });
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

  openAddMemberForm(): void {
    if (!this.selectedScope) return;

    if (!this.canAssignMembers()) {
      this.snackBar.open('No permission to add members', 'Close', { duration: 3000 });
      return;
    }

    this.selectedMember = null;
    this.selectedDivision = null;
    this.formType = 'member-add';
    this.isEditMode = false;
    this.isFormVisible = true;

    const assignableRoles = this.getAssignableRoles();
    const defaultRole = assignableRoles.includes(UserRoleType.User)
      ? UserRoleType.User
      : assignableRoles[assignableRoles.length - 1] || UserRoleType.User;

    this.memberAddForm.reset({
      selectedUser: null,
      role: defaultRole
    });
  }

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

  // ========== Form Submission ==========
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
      this.snackBar.open('Please select a user', 'Close', { duration: 3000 });
      return;
    }

    this.addMember(formValue);
  }

  private createNewDivision(formValue: DivisionFormData): void {
    if (!this.canCreateDivision()) {
      this.snackBar.open('No permission to create division', 'Close', { duration: 3000 });
      return;
    }

    const createRequest = {
      name: formValue.name,
      label: formValue.label,
      description: formValue.description
    };

    this.subscriptions.add(
      this.memberService.createDivision(createRequest).subscribe({
        next: () => {
          this.snackBar.open('Division created successfully', 'Close', { duration: 3000 });
          this.loadDivisions();
          this.closeForm();
        },
        error: (error) => {
          this.logger.error('Error creating division:', error);
          this.snackBar.open('Failed to create division', 'Close', { duration: 3000 });
        }
      })
    );
  }

  private updateDivision(formValue: DivisionFormData): void {
    if (!this.selectedDivision || !this.canUpdateDivision()) {
      this.snackBar.open('No permission to update division', 'Close', { duration: 3000 });
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
        next: () => {
          this.snackBar.open('Division updated successfully', 'Close', { duration: 3000 });
          this.loadDivisions();
          this.closeForm();
        },
        error: (error) => {
          this.logger.error('Error updating division:', error);
          this.snackBar.open('Failed to update division', 'Close', { duration: 3000 });
        }
      })
    );
  }

  private addMember(formValue: MemberAddFormData): void {
    if (!this.selectedScope || !formValue.selectedUser) return;

    if (!this.canAssignRole(formValue.selectedUser.id, formValue.role)) {
      const errorMessage = this.userRolePermissionService.generatePermissionErrorMessage(
        'Role assignment',
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
          this.snackBar.open('Member added successfully', 'Close', { duration: 3000 });
          this.loadMembers();
          this.closeForm();
          this.isLoading = false;
        },
        error: (error) => {
          this.logger.error('Error adding member:', error);
          this.snackBar.open('Failed to add member', 'Close', { duration: 3000 });
          this.isLoading = false;
        }
      })
    );
  }

  private updateMember(formValue: MemberFormData): void {
    if (!this.selectedMember) return;

    const userRoleContext = {
      userId: this.selectedMember.userId,
      divisionId: this.selectedMember.divisionId,
      currentRoles: this.selectedMember.roles,
      isActive: this.selectedMember.isActive
    };

    if (!this.userRolePermissionService.canEditUserRole(userRoleContext, this.selectedMember.divisionId)) {
      const errorMessage = this.userRolePermissionService.generatePermissionErrorMessage(
        'Role editing',
        this.selectedMember.userId === this.getCurrentUserId() ? 'self_edit' : 'insufficient_authority'
      );
      this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
      return;
    }

    const newRole = formValue.roles[0] || UserRoleType.User;
    if (!this.canAssignRole(this.selectedMember.userId, newRole)) {
      const errorMessage = this.userRolePermissionService.generatePermissionErrorMessage(
        'Role assignment',
        'role_not_assignable'
      );
      this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
      return;
    }

    const updateRequest = {
      role: newRole,
      isActive: formValue.isActive,
      userId: this.selectedMember.userId,
    };

    this.subscriptions.add(
      this.memberService.updateMember(this.selectedMember.divisionId, this.selectedMember.user.id, updateRequest).subscribe({
        next: () => {
          const logMetadata = this.userRolePermissionService.generateRoleChangeMetadata(
            this.selectedMember!.userId,
            this.selectedMember!.roles,
            [newRole],
            this.selectedMember!.divisionId
          );
          this.logger.debug('Role change logged:', logMetadata);

          this.snackBar.open('Member updated successfully', 'Close', { duration: 3000 });
          this.loadMembers();
          this.closeForm();
        },
        error: (error) => {
          this.logger.error('Error updating member:', error);
          this.snackBar.open('Failed to update member', 'Close', { duration: 3000 });
        }
      })
    );
  }

  removeMember(member: ExtendedDivisionMemberForView): void {
    if (!this.canRemoveMember(member)) {
      const errorMessage = this.userRolePermissionService.generatePermissionErrorMessage(
        'Member removal',
        member.userId === this.getCurrentUserId() ? 'self_edit' : 'insufficient_authority'
      );
      this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
      return;
    }

    if (!confirm(`Remove ${member.user.name} from division?`)) {
      return;
    }

    this.subscriptions.add(
      this.memberService.removeMember(member.divisionId, member.userId).subscribe({
        next: () => {
          this.snackBar.open('Member removed', 'Close', { duration: 3000 });
          this.loadMembers();
        },
        error: (error) => {
          this.logger.error('Error removing member:', error);
          this.snackBar.open('Failed to remove member', 'Close', { duration: 3000 });
        }
      })
    );
  }

  bulkRemoveMembers(): void {
    if (this.selectedIds.size === 0) return;

    if (!this.canManageUserRoles()) {
      this.snackBar.open('No permission to manage user roles', 'Close', { duration: 3000 });
      return;
    }

    const membersToRemove = this.filteredMembers.filter(member =>
      this.selectedIds.has(member.id)
    );

    const unremovableMembers = membersToRemove.filter(member => !this.canRemoveMember(member));

    if (unremovableMembers.length > 0) {
      const selfInList = unremovableMembers.some(member => member.userId === this.getCurrentUserId());
      const errorMessage = selfInList
        ? 'Cannot include yourself in bulk removal'
        : 'Some members cannot be removed due to insufficient permissions';
      this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
      return;
    }

    const selectedCount = this.selectedIds.size;
    if (!confirm(`Remove ${selectedCount} selected members?`)) {
      return;
    }

    const removePromises = membersToRemove.map(member =>
      this.memberService.removeMember(member.divisionId, member.userId).toPromise()
    );

    Promise.all(removePromises).then(() => {
      this.snackBar.open(`${selectedCount} members removed`, 'Close', { duration: 3000 });
      this.selectedIds.clear();
      this.loadMembers();
    }).catch(error => {
      this.logger.error('Error in bulk remove:', error);
      this.snackBar.open('Bulk removal failed', 'Close', { duration: 3000 });
    });
  }

  // ========== Validation Helpers ==========
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

  refresh(): void {
    this.loadMembers();
    this.loadDivisions();
    this.loadAvailableUsers();
  }

  // ========== Permission Methods ==========
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

  canManageUserRoles(): boolean {
    if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
      return false;
    }
    return this.userRolePermissionService.canManageUserRoles(this.selectedScope.scopeId);
  }

  canCreateDivision(): boolean {
    return this.userRolePermissionService.canCreateDivision();
  }

  canUpdateDivision(): boolean {
    if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
      return false;
    }
    return this.userRolePermissionService.canUpdateDivision(this.selectedScope.scopeId);
  }

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

  canAssignMembers(): boolean {
    if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
      return false;
    }
    return this.userRolePermissionService.canManageUserRoles(this.selectedScope.scopeId);
  }

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

  getAssignableRoles(): UserRoleType[] {
    if (!this.selectedScope || this.selectedScope.scopeType !== ScopeType.DIVISION) {
      return [];
    }
    return this.userRolePermissionService.getAssignableRoles(this.selectedScope.scopeId);
  }

  getCurrentUserId(): string {
    return this.g.info?.user?.id || '';
  }

  get availableRoles(): UserRoleType[] {
    if (this.formType === 'member-add' || this.formType === 'member') {
      return this.getAssignableRoles();
    }
    return this.memberService.getAvailableRoles();
  }

  // ========== Scope Helpers ==========
  getScopeLabel(): string {
    if (!this.selectedScope) return '';
    return `${this.selectedScope.scopeType}: ${this.selectedScope.scopeId}`;
  }
}
