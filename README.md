# Botmock Rasa Export

Node.js project for importing [Botmock](https://botmock.com) projects in [Rasa](https://rasa.com/)

> **Note**: The deprecated version of this exporter can be found in the `legacy` branch.

## Table of Contents

* [Overview](#overview)
  * [Usage](#usage)
  * [Handling import errors](#handling-import-errors)

## Overview

### Usage

> **Note**: prerequisites
> - [Node.js LTS version](https://nodejs.org/en/)

Running the following commands should allow you to generate restorable content from your Botmock project.

- `git clone git@github.com:Botmock/botmock-rasa-export.git`
- `cd botmock-rasa-export`
- `npm install`
- `mv ./sample.env ./env` and edit `.env` to contain your token and project ids
- `npm start`

`./data` and `./domain.yml` should be generated in your project root.

### Handling import errors

If Rasa CLI issues an error, note that you may have to manually edit `domain.yml`.
