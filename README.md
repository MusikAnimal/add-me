# AddMe

[![Node.js CI](https://github.com/MusikAnimal/add-me/actions/workflows/node.js.yml/badge.svg)](https://github.com/MusikAnimal/add-me/actions/workflows/node.js.yml)

MediaWiki gadget that allows users to join/endorse a proposal, project, or idea.

## Usage

See https://meta.wikimedia.org/wiki/Meta:AddMe#Usage

## Contributing

* Ensure you're using the Node version specified by .nvmrc
* `npm install` to install dependencies
* `npm run test` to run linting tests
* `npm run build` to compile the source into the dist/ directory.
  These are the files that should be deployed to the wiki.

While developing, you can load the uncompiled code served from your local to the wiki.
To do this, add the following to your [global.js](https://meta.wikimedia.org/wiki/Special:MyPage/global.js):

```
mw.loader.load('http://localhost:5501/src/AddMe.js');
```

## Deployment

NOTE: You must have `interface-admin` rights to use the deploy script. Visit https://meta.wikimedia.org/wiki/Special:BotPasswords to obtain credentials.

To deploy the files in the dist/ directory, run node bin/deploy.js [username] [password] "[edit summary]".
The edit summary is transformed to include the version number and git SHA, e.g. "v5.5.5 at abcd1234: [edit summary]".
