
export { fileIcons } from './icons/fileIcons';
export { folderIcons } from './icons/folderIcons';
export { languageIcons } from './icons/languageIcons';
export type { CloneOptions } from './models/icons/cloneOptions';
export type { DefaultIcon } from './models/icons/defaultIcon';
export type { FileIcon } from './models/icons/files/fileIcon';
export type { FileIcons } from './models/icons/files/fileTypes';
export type { FolderIcon } from './models/icons/folders/folderIcon';
export type {
  FolderTheme,
  FolderThemeName,
} from './models/icons/folders/folderTheme';
export { IconPack, type IconPackValue } from './models/icons/iconPack';
export type { LanguageIcon } from './models/icons/languages/languageIdentifier';
export { FileNamePattern } from './models/icons/patterns/patterns';
export { parseByPattern } from './patterns/patterns';

// オリジナルで追加
import { fileIcons } from './icons/fileIcons';
import { folderIcons } from './icons/folderIcons';
export function getFileIcon(name: string): string {
  const splitted = name.split('\.');
  const extension1 = (splitted.pop() || '').toLocaleLowerCase();
  splitted.shift();
  const extension2 = splitted.join('.').toLocaleLowerCase();
  const icon = fileIcons.icons.find(icon => {
    return icon.fileNames?.includes(name) || icon.fileExtensions?.includes(extension2) || icon.fileExtensions?.includes(extension1);
  })
  return icon ? icon.name : fileIcons.defaultIcon.name;
}
export function getFolderIcon(name: string): string {
  name = name.toLocaleLowerCase();
  const icon = folderIcons.map(icon => {
    return icon.icons?.find(icon => {
      return icon.folderNames.includes(name);
    })
  }).find(icon => icon);
  // console.log(icon ? icon.name : fileIcons.defaultIcon.name);
  return icon ? icon.name : 'folder';
}