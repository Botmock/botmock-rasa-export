# Botmock Rasa Export

[![Build Status](https://dev.azure.com/botmock/botmock-rasa-export/_apis/build/status/Botmock.botmock-rasa-export?branchName=master)](https://dev.azure.com/botmock/botmock-rasa-export/_build/latest?definitionId=5&branchName=master)

> creates [rasa](https://rasa.com) domain, nlu, and stories from a [botmock](https://botmock.com) project

This script generates Rasa [training data](https://rasa.com/docs/rasa/nlu/training-data-format/#training-data-format), [stories](https://rasa.com/docs/rasa/core/stories/#stories), and [domain](https://rasa.com/docs/rasa/core/domains/) from a given Botmock project.

## Table of Contents

* [Overview](#overview)
  * [Botmock project structure](#botmock-project-structure)
  * [Caveats](#caveats)
  * [Prerequisites](#prerequisites)
    * [nodejs](#nodejs)
    * [rasa](#rasa)
  * [Installation](#installation)
    * [clone](#clone)
    * [env](#env)
  * [Commands](#commands)
    * [start](#start)
  * [Importing](#importing)

## Overview

### Botmock project structure

### Caveats

### Prerequisites

#### NodeJS

- [Node JS](https://nodejs.org/en/) version 12.x

```bash
#determine nodejs version
node --version
```

#### Rasa

- [Rasa](https://rasa.com/docs/rasa/user-guide/installation/#quick-installation) installation

### Installation

#### Clone

Clone this repository and install dependencies:

```shell
git clone git@github.com:Botmock/botmock-rasa-export.git

cd botmock-rasa-export

npm i
```

#### Env

Create `.env` in `/botmock-rasa-export` and fill in values for the following:

```shell
BOTMOCK_TOKEN=@botmock-token
BOTMOCK_TEAM_ID=@botmock-team-id
BOTMOCK_BOARD_ID=@botmock-board-id
BOTMOCK_PROJECT_ID=@botmock-project-id
```

To get your Botmock API token, follow the [guide](http://help.botmock.com/en/articles/2334581-developer-api).

### Commands

#### `start`

Populates `/output` with `.md` and `.yml` files produced from your original project.

```shell
npm start
```

### Importing

- move `/output/domain.yml` and `/output/data/nlu.md` and `/output/data/stories.md` to your Rasa project directory
- cd into your Rasa project directory
- run `rasa train`
- run `rasa shell`
