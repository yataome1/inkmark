// vendor/cm.js 的打包入口（FR-601）：只转出第三方模块，应用代码不经打包。
export * from '@codemirror/state';
export * from '@codemirror/view';
export * from '@codemirror/commands';
export * from '@codemirror/language';
export * from '@codemirror/lang-markdown';
export * from '@codemirror/search';
export { default as MarkdownIt } from 'markdown-it';
export { default as markdownItFootnote } from 'markdown-it-footnote';
export { default as markdownItMark } from 'markdown-it-mark';
export { default as markdownItTaskLists } from 'markdown-it-task-lists';
