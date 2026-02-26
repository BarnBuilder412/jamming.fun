import globals from 'globals';
import { defineBaseConfig } from './base.mjs';

export function defineNodeConfig(options = {}) {
  return [
    ...defineBaseConfig(options),
    {
      languageOptions: {
        globals: {
          ...globals.node,
        },
      },
    },
  ];
}
