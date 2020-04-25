const path = require('path');
const fs = require('fs');
const babel = require('@babel/core');
const shell = require('shelljs');
const fse = require('fs-extra');


const TARGET_PKG_NAME = 'axuebin';
const FILE_NAME = './test.js';
const file = path.join(process.cwd(), FILE_NAME);

/**
 * 判断是否 require 了正确的包
 * @param {*} node 节点
 */
const isTrueRequire = node => {
  const { callee, arguments } = node;
  return callee.name === 'require' && arguments.some(item => item.value === TARGET_PKG_NAME);
};

/**
 * 判断是否安装了某个包
 * @param {string} pkg 包名
 */
const hasPkg = pkg => {
  const pkgPath = path.join(process.cwd(), `package.json`);
  const pkgJson = fs.existsSync(pkgPath) ? fse.readJsonSync(pkgPath) : {};
  const { dependencies = {}, devDependencies = {} } = pkgJson;
  return dependencies[pkg] || devDependencies[pkg];
}

/**
 * 通过 npm 安装包
 * @param {string} pkg  包名
 */
const installPkg = pkg => {
  console.log(`开始安装 ${pkg}`);
  const npm = shell.which('npm');
  if (!npm) {
    console.log('请先安装 npm');
    return;
  }
  const { code } = shell.exec(`${npm.stdout} install ${pkg} -S`);
  if (code) {
    console.log(`安装 ${pkg} 失败，请手动安装`);
  }
};

/**
 * 自动在代码中插入 import 引用语句
 */
function transform() {
  const content = fs.readFileSync(file, {
    encoding: 'utf8',
  });
  const { code } = babel.transformSync(content, {
    sourceMaps: false,
    plugins: [
      babel.createConfigItem(({types: t}) => ({
        visitor: {
          Program(path) {
            const bodyPath = path.get('body');
            const hasRequireOrImport = bodyPath.some(nodePath => {
              // 判断是否是 import b from 'b'; 语句
              if (nodePath.isImportDeclaration()) {
                return nodePath.get('source').isStringLiteral() && nodePath.get('source').node.value === TARGET_PKG_NAME;
              }
              // 判断是否是 const a = require('a'); 语句
              if (nodePath.isVariableDeclaration()) {
                const declaration = nodePath.get('declarations')[0];
                return declaration.get('init').isCallExpression && isTrueRequire(declaration.get('init').node);
              }
              // 判断是否是 require('c'); 语句
              if (nodePath.isExpressionStatement()) {
                return isTrueRequire(nodePath.get('expression').node);
              }
            });
            if (!hasRequireOrImport) {
              const importDefaultSpecifier = [t.ImportDefaultSpecifier(t.Identifier(TARGET_PKG_NAME))];
              const importDeclaration = t.ImportDeclaration(importDefaultSpecifier, t.StringLiteral(TARGET_PKG_NAME));
              path.get('body')[0].insertBefore(importDeclaration);
            }
          }
        }
      }))
    ]
  });
  return code;
}

const code = transform();
fs.writeFileSync(FILE_NAME, code);

if (!hasPkg(TARGET_PKG_NAME)) {
  installPkg(TARGET_PKG_NAME);
}