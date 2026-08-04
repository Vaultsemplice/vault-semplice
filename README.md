 Vault Semplice — Open Source Cryptographic Core
Vault Semplice is a privacy-focused platform designed to make secure file encryption simple, accessible and transparent.

This repository contains the open-source cryptographic components and technical specifications used by Vault Semplice. The goal is to allow developers, security researchers and users to inspect the implementation, understand how .vault files are created and protected, test the cryptographic mechanisms, and contribute to improving their security.

🔒 Security by design

Vault Semplice uses AES-256-GCM authenticated encryption to protect file contents while providing confidentiality and integrity.

The cryptographic implementation is designed around principles such as:

AES-256-GCM authenticated encryption
Secure password-based key derivation
Cryptographically secure salts and initialization vectors
Authentication of security-relevant metadata
Detection of unauthorized modifications
Compatibility with the .vault file format
Client-side and privacy-oriented processing
Automated cryptographic and security tests

The security of Vault Semplice is not intended to depend on keeping its cryptographic implementation secret. By making the core available for inspection, researchers and developers can independently analyze the implementation and report potential security issues.

 The .vault format

Vault Semplice uses its own .vault container format to store encrypted files and the information required for their secure processing.

The public documentation in this repository describes the parts of the format required to understand, validate and work with Vault Semplice encrypted files.

Compatibility and security tests are included to help ensure that changes to the implementation do not silently compromise existing encrypted files.

 Security testing

Security is treated as an ongoing process.

The project includes automated tests covering encryption and decryption, incorrect passwords, corrupted data, metadata manipulation and compatibility between supported versions of the .vault format.

Security vulnerabilities should be reported responsibly according to the instructions provided in SECURITY.md.

 Open core, proprietary product

This repository represents the open-source security core of Vault Semplice, not the complete Vault Semplice platform.

Some product features, infrastructure, backend systems, anti-abuse mechanisms and proprietary technologies are intentionally maintained separately and are not part of this repository.

This separation allows the cryptographic foundations of Vault Semplice to remain transparent and independently inspectable while preserving proprietary technologies developed for the complete platform.

 License

The open-source components contained in this repository are distributed under the Apache License 2.0, unless otherwise specified.

 Vault Semplice

Learn more about the complete project at vaultsemplice.com.

Simple to use. Built for privacy. Open where security should be verifiable.
