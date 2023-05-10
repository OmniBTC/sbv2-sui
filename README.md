<div align="center">
  <a href="#">
    <img src="https://github.com/switchboard-xyz/sbv2-core/raw/main/website/static/img/icons/switchboard/avatar.png" />
  </a>

  <h1>Switchboard V2</h1>

  <p>A collection of libraries and examples for interacting with Switchboard V2 on Sui.</p>

  <p>
	  <a href="https://www.npmjs.com/package/@switchboard-xyz/sui.js">
      <img alt="NPM Badge" src="https://img.shields.io/github/package-json/v/switchboard-xyz/sbv2-sui?color=red&filename=javascript%2Fsui.js%2Fpackage.json&label=%40switchboard-xyz%2Fsui.js&logo=npm" />
    </a>
  </p>
</div>

## Getting Started

To get started, clone the
[sbv2-sui](https://github.com/switchboard-xyz/sbv2-sui) repository.

```bash
git clone https://github.com/switchboard-xyz/sbv2-sui
```

Then install the dependencies

```bash
cd sbv2-sui
pnpm install
```

## Program IDs

The following addresses can be used with the Switchboard deployment on Sui

#### Mainnet

| Account              | Address                                                              |
| -------------------- | -------------------------------------------------------------------- |
| Program ID           | `0xfd2e0f4383df3ec9106326dcd9a20510cdce72146754296deed15403fcd3df8b` |
| Program Authority    | `0xcf2d51b3ca8c23e0ba312392d213b1293a3121f691fa8e120f1a968fc2ad1c8b` |
| SwitchboardStdLib    | `0x08d79f4d920b03d88faca1e421af023a87fbb1e4a6fd200248e6e9998d09e470` |
| Permissioned Queue   | `0xea802bde1319363a27134a72a9d2f45e110fd60ef32ab2e10cdb06c973d6c64f` |
| Permissionless Queue | `0xe9324b82374f18d17de601ae5a19cd72e8c9f57f54661bf9e41a76f8948e80b5` |

#### Testnet

| Account              | Address                                                              |
| -------------------- | -------------------------------------------------------------------- |
| Program ID           | `0x271beaa1f36bf8812a778f0df5a7a9f67a757008512096862a128c42923671e2` |
| Program Authority    | `0xc9c8e0d738d7f090144847b38a8283fbe8050923875771b8c315a461721c04a4` |
| SwitchboardStdLib    | `0x524c15a935d4c34474cdf2604ee42a6c47591d13c6ffb6b678f6b7eaffba12fe` |
| Permissionless Queue | `0xaabd44ddf31bd5ea2971777fc848c33411942d0128976e4e8d787d2d59e8259a` |

## Libraries

| **Lang**   | **Name**                                                 | **Description**                                            |
| ---------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Move       | [SwitchboardStd](move/mainnet/switchboard_std)           | A Move module to interact with Switchboard on Sui mainnet. |
| Move       | [SwitchboardStd (testnet)](move/testnet/switchboard_std) | A Move module to interact with Switchboard on Sui testnet. |
| Javascript | [@switchboard-xyz/sui.js](javascript/sui.js)             | A Typescript client to interact with Switchboard on Sui.   |

## Example Programs

- [feed-parser-mainnet](/programs/mainnet/feed-parser/): Read a Switchboard feed
  on Sui Mainnet
- [feed-parser-testnet](/programs/testnet/feed-parser/): Read a Switchboard feed
  on Sui Testnet

## Troubleshooting

1. File a
   [GitHub Issue](https://github.com/switchboard-xyz/sbv2-solana/issues/new)
2. Ask a question in
   [Discord #dev-support](https://discord.com/channels/841525135311634443/984343400377647144)
