import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'unitmux',
  description:
    'A floating desktop app that sends input to AI coding assistants running in tmux — without touching your mouse',
  head: [
    ['meta', { property: 'og:title', content: 'unitmux' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'Control AI sessions in tmux without touching your mouse'
      }
    ]
  ],
  themeConfig: {
    nav: [{ text: 'Guide', link: '/guide/getting-started' }],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Usage', link: '/guide/usage' },
          { text: 'Image Attachment', link: '/guide/images' },
          { text: 'Shell Mode', link: '/guide/shell' },
          { text: 'Slash Commands & Skills', link: '/guide/skills' },
          { text: 'Keyboard Shortcuts', link: '/guide/shortcuts' },
          { text: 'Settings', link: '/guide/settings' },
          { text: 'Git Operations', link: '/guide/git' }
        ]
      }
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/yugo-ibuki/unitmux' }],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 yugo-ibuki'
    }
  }
})
