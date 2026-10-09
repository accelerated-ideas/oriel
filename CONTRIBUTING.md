# Contributing

Thanks for helping out. A few things make reviews quick.

- **Setup:** follow "Local setup" in the [README](README.md).
- **Bigger changes:** open an issue first, so we can agree on the approach before you write it.
- **Conventions:** [AGENTS.md](AGENTS.md) lists them, and they apply to people as much as to AI coding agents. Product names go through `BRAND`, model calls record their cost, plan logic does nothing on self-hosted installs, new tables have row-level security on, and UI copy is plain, in sentence case, with no filler.
- **Database:** add a new file in `supabase/migrations`; never edit one that has been applied.
- **Before opening a pull request:** run `npm run typecheck && npm run lint && npm run build`, and say in the description what you tested and how.
- **License:** the project is AGPL-3.0. On your first pull request a bot asks you to sign the [Contributor License Agreement](CLA.md) by posting a comment; it's once per person.
- **Security issues:** don't open a public issue. See [SECURITY.md](SECURITY.md).
