import type { RtcCredentials, SessionSnapshot } from "@voice/contracts";

export interface IssueRtcCredentialsCommand {
  readonly session: SessionSnapshot;
}

export interface RtcCredentialIssuer {
  issue(command: IssueRtcCredentialsCommand): RtcCredentials;
}
