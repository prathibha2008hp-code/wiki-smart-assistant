import os
import json
import glob
import argparse

import pandas as pd
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer


def extract_text(row):
    """Create searchable text from a Wikipedia article."""

    parts = []

    # Article title
    if pd.notna(row.get("name")):
        parts.append(str(row["name"]))

    # Abstract
    if pd.notna(row.get("abstract")):
        parts.append(str(row["abstract"]))

    # Description
    if pd.notna(row.get("description")):
        parts.append(str(row["description"]))

    # Sections are stored as JSON text
    if pd.notna(row.get("sections")):
        parts.append(str(row["sections"]))

    return "\n".join(parts)


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--data-dir",
        default="data",
        help="Directory containing Parquet files"
    )

    parser.add_argument(
        "--out-dir",
        default="index",
        help="Directory where the FAISS index will be saved"
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=2000,
        help="Maximum number of articles to index"
    )

    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    # Find Parquet files
    files = glob.glob(os.path.join(args.data_dir, "*.parquet"))

    if not files:
        raise FileNotFoundError(
            f"No Parquet files found in {args.data_dir}"
        )

    print(f"Found {len(files)} Parquet file(s)")

    # Load the first Parquet file
    file_path = files[0]

    print(f"Loading: {file_path}")

    df = pd.read_parquet(file_path)

    print(f"Total rows: {len(df)}")

    # Limit data for testing
    if args.limit:
        df = df.head(args.limit)

    print(f"Indexing {len(df)} articles...")

    # Create searchable text
    texts = []

    for _, row in df.iterrows():
        texts.append(extract_text(row))

    # Load embedding model
    print("Loading embedding model...")

    model = SentenceTransformer("all-MiniLM-L6-v2")

    # Create embeddings
    print("Creating embeddings...")

    embeddings = model.encode(
        texts,
        show_progress_bar=True,
        convert_to_numpy=True
    )

    # Convert to float32 for FAISS
    embeddings = embeddings.astype("float32")

    # Normalize embeddings
    faiss.normalize_L2(embeddings)

    # Create FAISS index
    dimension = embeddings.shape[1]

    index = faiss.IndexFlatIP(dimension)

    index.add(embeddings)

    # Save FAISS index
    index_path = os.path.join(
        args.out_dir,
        "articles.index"
    )

    faiss.write_index(index, index_path)

    # Save metadata
    metadata = []

    for _, row in df.iterrows():

        metadata.append({
            "name": None if pd.isna(row.get("name")) else str(row["name"]),
            "abstract": None if pd.isna(row.get("abstract")) else str(row["abstract"]),
            "description": None if pd.isna(row.get("description")) else str(row["description"]),
            "url": None if pd.isna(row.get("url")) else str(row["url"])
        })

    metadata_path = os.path.join(
        args.out_dir,
        "articles.json"
    )

    with open(
        metadata_path,
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(
            metadata,
            f,
            ensure_ascii=False,
            indent=2
        )

    print("\nIndexing complete!")
    print(f"FAISS index: {index_path}")
    print(f"Metadata: {metadata_path}")


if __name__ == "__main__":
    main()