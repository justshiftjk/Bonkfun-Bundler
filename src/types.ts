import { PublicKey, VersionedTransactionResponse } from "@solana/web3.js";

export type CreateTokenMetadata = {
  name: string;
  symbol: string;
  description: string;
  file: Blob;
  twitter?: string;
  telegram?: string;
  website?: string;
};


export type CreateBonkTokenMetadata = {
  name: string;
  symbol: string;
  description: string;
  createdOn: string;
  platformId: string;
  image?: string;
};

export type CreateImageMetadata = {

  file: Blob;

};

export type TokenMetadata = {
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName: boolean;
  createdOn: string;
  twitter: string;
};
