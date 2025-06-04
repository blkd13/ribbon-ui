import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterModule } from '@angular/router';

interface MenuItem {
  link: string;
  icon: string;
  label: string;
  key: string;
}
@Component({
  selector: 'app-admin',
  imports: [MatIconModule, MatButtonModule, MatFormFieldModule, MatSlideToggleModule, MatSelectModule, FormsModule, CommonModule, RouterModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent {
  activeSection = 'profile';

  menuItems: MenuItem[] = [
    { link: 'ai-provider-template-management', icon: 'extension', label: 'AIプロバイダーテンプレート', key: 'aiProviderTemplateManagement' },
    { link: 'ext-api-provider-template-form', icon: 'extension', label: 'APIテンプレート', key: 'extApiProviderTemplateManagement' },
    { link: 'ai-provider-management', icon: 'extension', label: 'AIプロバイダー', key: 'aiProviderManagement' },
    { link: 'ai-model-management', icon: 'extension', label: 'AIモデル', key: 'aiModelManagement' },
    { link: 'ext-api-provider-form', icon: 'extension', label: 'API', key: 'extApiProviderManagement' },
    { link: 'department', icon: 'business', label: '部署管理', key: 'departmentManagement' },

    // { icon: 'person', label: 'プロファイル', key: 'profile' },
    // { icon: 'palette', label: '外観', key: 'appearance' },
    // { icon: 'account_circle', label: 'アカウント', key: 'account' },
    // { icon: 'security', label: 'プライバシー', key: 'privacy' },
    // { icon: 'payment', label: '請求', key: 'billing' },
    // { icon: 'extension', label: '連携機能', key: 'integrations' }
  ];

  // フォームデータ
  formData = {
    lastName: '0',
    firstName: 'unknown',
    occupation: '',
    personalSettings: '例：私は主にPythonでコーディングをしています（初心者ではありません）'
  };

  occupationOptions = [
    '職務を選択してください',
    'ソフトウェアエンジニア',
    'データサイエンティスト',
    'プロダクトマネージャー',
    'デザイナー',
    'マーケティング',
    'その他'
  ];

  // 機能プレビュー設定
  analysisToolEnabled = true;

  constructor() {
    this.formData.occupation = this.occupationOptions[0];
  }

  setActiveSection(section: string) {
    this.activeSection = section;
  }

  onSubmit() {
    console.log('Form submitted:', this.formData);
  }

  toggleAnalysisTool() {
    this.analysisToolEnabled = !this.analysisToolEnabled;
  }
}