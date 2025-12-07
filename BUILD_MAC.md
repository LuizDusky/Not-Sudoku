# Build para macOS (Intel)

1) Instale as dependências  
```bash
npm install
```

2) Gere a build (.app dentro do DMG/ZIP)  
```bash
npm run build
```

O resultado fica em `release/` com alvos `dmg` e `zip` para arquitetura `x64` (Intel), conforme `electron-builder.yml`. Se precisar alterar appId, nome ou ícones, ajuste esse arquivo. Para um .app puro sem DMG/ZIP, use `npx electron-builder --dir --mac x64`.
