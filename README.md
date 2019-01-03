## river-scaffold

Typescript-React's scaffold, the scaffold configures are learning from poi and vue-cli.

##### npm

```
npm install
npm run serve
npm run build
```

##### yarn

```
yarn
yarn serve
yarn build
```

### css

you can set css-modules in scaffold, settings in `river.config.js`

```javascript
css: {
  modules: true;
}
```

if you set it, you can import `*.module.(css|less|scss|styl)$` as cssModules in your project.
you also can add css loaders options in css object.

### webpack

you can add webpack configures in the `river.config.js`.
