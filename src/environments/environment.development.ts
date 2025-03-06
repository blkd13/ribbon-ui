export const environment = {
  production: true,
  apiUrl: '/api',
  // apiUrl: 'http://localhost:3000/api',
  mattermostOriginUri: 'https://mattermost.com',
  boxOriginUri: 'https://app.box.com',
  apiKeyProviders: [
    {
      value: 'confluence', label: 'Confluence',
      providers: [
        { id: '', label: '', describe: ``, href: 'https://sample.atlassian.net/wiki/' },
      ],
    },
    {
      value: 'jira', label: 'Jira',
      providers: [
        { id: '', label: '', describe: ``, href: 'https://sample.atlassian.net/jira/' },
      ],
    },
  ],
  oAuthProviders: [
    {
      value: 'mattermost', label: 'Mattermost',
      providers: [
        { id: '', label: '', describe: `Mattermostとデータ連携します。\n\n複数チームにまたがるチャネルを纏めることができます。\n\nAI要約ができます。` },
      ],
    },
    {
      value: 'box', label: 'Box',
      providers: [
        { id: '', label: '', describe: '【工事中】 Boxとデータ連携します。\n※AI機能はありません。\nキャッシュを利かせることでやや速くしただけのBoxのブラウザ。' },
      ],
    },
    {
      value: 'gitea', label: 'Gitea', group: 'git',
      providers: [
        { id: 'local', label: 'gitea-local', describe: '【工事中】 giteaとデータ連携します。\n※特に機能はありません。' },
      ],
    },
    {
      value: 'gitlab', label: 'Gitlab', group: 'git',
      providers: [
        { id: 'local', label: 'gitlab-local', describe: '【工事中】 gitlabとデータ連携します。\n※特に機能はありません。' },
      ],
    },
  ],
};
