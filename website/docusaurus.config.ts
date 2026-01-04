import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import path from 'path';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'DataVista',
  tagline: 'Customizable real-time data widgets for your Homey dashboards',
  favicon: 'img/favicon.svg',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://datavista.erikvl87.nl',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'Erikvl87', // Usually your GitHub org/user name.
  projectName: 'nl.erikvl87.datavista', // Usually your repo name.

  onBrokenLinks: 'throw',

  plugins: [
    function homeycomposeAliasPlugin() {
      return {
        name: 'homeycompose-alias-plugin',
        configureWebpack() {
          return {
            resolve: {
              alias: {
                '@homeycompose': path.resolve(__dirname, '../.homeycompose'),
              },
            },
          };
        },
      };
    },
  ],

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/Erikvl87/nl.erikvl87.datavista/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'DataVista',
      logo: {
        alt: 'DataVista Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://community.homey.app/t/app-pro-datavista/121482?u=erikvl87',
          label: 'Community',
          position: 'left',
        },
        {
          href: 'https://github.com/Erikvl87/nl.erikvl87.datavista',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://www.paypal.com/paypalme/erikvl87',
          label: 'Donate',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Overview',
              to: '/docs/intro',
            },
            {
              label: 'Getting Started',
              to: '/docs/getting-started',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Homey Community Forum',
              href: 'https://community.homey.app/',
            },
            {
              label: 'DataVista Topic',
              href: 'https://community.homey.app/t/app-pro-datavista/121482?u=erikvl87',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/Erikvl87/nl.erikvl87.datavista',
            },
            {
              label: 'Donate',
              href: 'https://www.paypal.com/paypalme/erikvl87',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Erik van Leeuwen.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
